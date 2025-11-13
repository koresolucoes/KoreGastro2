
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';
import { Order, CompanyProfile, Recipe, Transaction } from '../src/models/db.models.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const focusNFeHomologacaoUrl = 'https://homologacao.focusnfe.com.br';
const focusNFeProducaoUrl = 'https://api.focusnfe.com.br';

type FocusNFeAction = 'save_settings' | 'emit_nfce' | 'cancel_nfce' | 'consultar_cnpj';

// --- Main Handler ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        return res.status(405).json({ error: { message: 'Method Not Allowed' } });
    }

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: { message: 'Authorization header is missing.' } });
        }
        const providedApiKey = authHeader.split(' ')[1];

        const { restaurantId, action, payload } = req.body;
        if (!restaurantId || !action) {
            return res.status(400).json({ error: { message: '`restaurantId` and `action` are required.' } });
        }

        const { data: profile, error: profileError } = await supabase
            .from('company_profile')
            .select('external_api_key, focusnfe_token, cnpj')
            .eq('user_id', restaurantId)
            .single();
            
        if (profileError || !profile || !profile.external_api_key) {
            return res.status(403).json({ error: { message: 'Invalid `restaurantId` or API key not configured.' } });
        }
        if (providedApiKey !== profile.external_api_key) {
            return res.status(403).json({ error: { message: 'Invalid API key.' } });
        }

        switch (action as FocusNFeAction) {
            case 'save_settings':
                await handleSaveSettings(res, restaurantId, profile.cnpj, profile.focusnfe_token, payload);
                break;
            case 'emit_nfce':
                await handleEmitNfce(res, restaurantId, profile.cnpj, profile.focusnfe_token, payload);
                break;
             case 'cancel_nfce':
                await handleCancelNfce(res, restaurantId, profile.focusnfe_token, payload);
                break;
            case 'consultar_cnpj':
                await handleConsultarCnpj(res, profile.focusnfe_token, payload);
                break;
            default:
                return res.status(400).json({ error: { message: `Unknown action: ${action}` } });
        }

    } catch (error: any) {
        console.error(`[API /focusnfe-proxy] Fatal error on action '${req.body.action}':`, error);
        return res.status(500).json({ error: { message: error.message || 'An internal server error occurred.' } });
    }
}


// --- Action Handlers ---

async function handleSaveSettings(res: VercelResponse, userId: string, cnpj: string | null, currentToken: string | null, payload: any) {
    const { token, certificateBase64, certificatePassword } = payload;

    const tokenToUse = token || currentToken;
    if (!tokenToUse) {
        throw new Error('O token da FocusNFe é obrigatório para esta operação.');
    }
    
    // Always save the token in our DB if a new one is provided.
    if (token) {
        await supabase.from('company_profile').update({ focusnfe_token: token }).eq('user_id', userId);
    }
    
    let certValidUntil: string | null = null;
    
    if (certificateBase64 && certificatePassword) {
        if (!cnpj) {
            throw new Error('O CNPJ da empresa precisa estar cadastrado para enviar o certificado.');
        }

        // 1. Get company ID from FocusNFe using CNPJ. This endpoint uses the Production URL.
        const companies = await callFocusNFeApi('GET', `/v2/empresas?cnpj=${cnpj.replace(/[^\d]/g, '')}`, tokenToUse, null, focusNFeProducaoUrl);
        const company = companies?.[0]; // The response is an array
        
        if (!company || !company.id) {
            throw new Error('Empresa não encontrada na FocusNFe. Verifique se o CNPJ está correto e cadastrado no painel da FocusNFe.');
        }
        const companyId = company.id;

        // 2. Prepare payload to update the company with the certificate
        const updatePayload = {
            arquivo_certificado_base64: certificateBase64,
            senha_certificado: certificatePassword,
        };
        
        // 3. Update the company on FocusNFe. This endpoint also uses the Production URL.
        const responseBody = await callFocusNFeApi('PUT', `/v2/empresas/${companyId}`, tokenToUse, updatePayload, focusNFeProducaoUrl);
        
        certValidUntil = responseBody?.certificado_valido_ate || null;
        if (certValidUntil) {
            await supabase.from('company_profile').update({ focusnfe_cert_valid_until: certValidUntil }).eq('user_id', userId);
        }
    }

    return res.status(200).json({ data: { message: 'Configurações salvas com sucesso.', cert_valid_until: certValidUntil } });
}


async function handleEmitNfce(res: VercelResponse, userId: string, cnpj: string | null, token: string | null, payload: any) {
    if (!token) throw new Error('FocusNFe Token not configured.');
    if (!cnpj) throw new Error('Company CNPJ not configured.');

    const { orderId } = payload;
    if (!orderId) throw new Error('`orderId` is required.');

    // FIX: Corrected the Supabase query to use `.like()` as a method call.
    const [orderRes, recipesRes, transactionsRes] = await Promise.all([
        supabase.from('orders').select('*, order_items(*), customers(cpf)').eq('id', orderId).single(),
        supabase.from('recipes').select('id, ncm_code').eq('user_id', userId),
        supabase.from('transactions').select('description, amount').like('description', `%Pedido #${orderId.slice(0,8)}%`).eq('type', 'Receita')
    ]);

    if (orderRes.error) throw new Error(`Order not found: ${orderRes.error.message}`);
    if (recipesRes.error) throw new Error(`Failed to fetch recipes: ${recipesRes.error.message}`);
    if (transactionsRes.error) throw new Error(`Failed to fetch transactions: ${transactionsRes.error.message}`);

    const order = orderRes.data;
    const ncmMap = new Map(recipesRes.data?.map(r => [r.id, r.ncm_code]));

    const nfcePayload = {
        cnpj_emitente: cnpj.replace(/[^\d]/g, ''),
        data_emissao: new Date().toISOString(),
        indicador_inscricao_estadual_destinatario: "9",
        modalidade_frete: "9",
        local_destino: "1",
        presenca_comprador: "1",
        natureza_operacao: "VENDA AO CONSUMIDOR",
        cpf_destinatario: order.customers?.cpf?.replace(/[^\d]/g, '') || '',
        items: (order.order_items || []).map((item: any, index: number) => {
            const total = item.price * item.quantity;
            const estimatedTaxes = total * 0.30; // Estimate 30% for IBPT
            return {
                numero_item: index + 1,
                codigo_ncm: ncmMap.get(item.recipe_id) || '21069090', // NCM for "Food preparations not elsewhere specified" as fallback
                quantidade_comercial: item.quantity.toFixed(2),
                quantidade_tributavel: item.quantity.toFixed(2),
                cfop: "5102",
                valor_unitario_tributavel: item.price.toFixed(2),
                valor_unitario_comercial: item.price.toFixed(2),
                valor_bruto: total.toFixed(2),
                descricao: item.name,
                codigo_produto: item.recipe_id.slice(0, 20),
                icms_origem: "0",
                icms_situacao_tributaria: "102", // Simples Nacional
                unidade_comercial: "un",
                unidade_tributavel: "un",
                valor_total_tributos: estimatedTaxes.toFixed(2)
            };
        }),
        formas_pagamento: (transactionsRes.data || []).map((t: Transaction) => ({
            forma_pagamento: mapPaymentMethodToCode(t.description),
            valor_pagamento: t.amount.toFixed(2)
        }))
    };
    
    await supabase.from('orders').update({ nfce_ref: orderId }).eq('id', orderId);

    const response = await callFocusNFeApi('POST', `/v2/nfce?ref=${orderId}`, token, nfcePayload, focusNFeHomologacaoUrl);
    
    const updatePayload = {
        nfce_status: response.status,
        nfce_url: response.caminho_danfe ? `${focusNFeHomologacaoUrl}${response.caminho_danfe}` : null,
        nfce_xml_path: response.caminho_xml_nota_fiscal ? `${focusNFeHomologacaoUrl}${response.caminho_xml_nota_fiscal}` : null,
        nfce_chave: response.chave_nfe,
        nfce_last_response: response as any
    };

    await supabase.from('orders').update(updatePayload).eq('id', orderId);
    
    return res.status(200).json({ data: response });
}

async function handleCancelNfce(res: VercelResponse, userId: string, token: string | null, payload: any) {
    if (!token) throw new Error('FocusNFe Token not configured.');

    const { orderId, justification } = payload;
    if (!orderId || !justification) throw new Error('`orderId` and `justification` are required.');

    const { data: order } = await supabase.from('orders').select('nfce_ref').eq('id', orderId).single();
    if (!order || !order.nfce_ref) throw new Error('NFC-e reference not found for this order.');

    const response = await callFocusNFeApi('DELETE', `/v2/nfce/${order.nfce_ref}`, token, { justificativa: justification }, focusNFeHomologacaoUrl);
    
    const updatePayload = {
        nfce_status: response.status,
        nfce_last_response: response as any,
        nfce_xml_path: response.caminho_xml_cancelamento ? `${focusNFeHomologacaoUrl}${response.caminho_xml_cancelamento}` : null,
    };
    
    await supabase.from('orders').update(updatePayload).eq('id', orderId);

    return res.status(200).json({ data: response });
}

async function handleConsultarCnpj(res: VercelResponse, token: string | null, payload: any) {
    if (!token) throw new Error('FocusNFe Token not configured.');
    const { cnpj } = payload;
    if (!cnpj || typeof cnpj !== 'string') throw new Error('`cnpj` is required.');

    const sanitizedCnpj = cnpj.replace(/[^\d]/g, '');
    if (sanitizedCnpj.length !== 14) throw new Error('Invalid CNPJ format. It must have 14 digits.');

    const responseBody = await callFocusNFeApi('GET', `/v2/cnpjs/${sanitizedCnpj}`, token, null, focusNFeProducaoUrl);
    
    return res.status(200).json({ data: responseBody });
}

// --- Helpers ---

async function callFocusNFeApi(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, token: string, body?: any, baseUrl: string = focusNFeHomologacaoUrl): Promise<any> {
    const url = `${baseUrl}${endpoint}`;
    const encodedToken = Buffer.from(`${token}:`).toString('base64');

    const options: RequestInit = {
        method,
        headers: {
            'Authorization': `Basic ${encodedToken}`,
            'Content-Type': 'application/json'
        },
    };

    if (body) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    const responseBodyText = await response.text();

    if (!response.ok) {
        let errorMessage;
        try {
            const errorJson = JSON.parse(responseBodyText);
            errorMessage = errorJson.mensagem_sefaz || errorJson.mensagem || errorJson.erros?.[0]?.mensagem || JSON.stringify(errorJson);
        } catch (e) {
            errorMessage = responseBodyText.substring(0, 200);
        }
        console.error(`FocusNFe API Error (${response.status}) on ${method} ${endpoint}:`, responseBodyText);
        throw new Error(`Erro na API FocusNFe: ${errorMessage}`);
    }

    try {
        return responseBodyText ? JSON.parse(responseBodyText) : null;
    } catch (e) {
        console.error(`Failed to parse JSON from FocusNFe on ${method} ${endpoint}. Body:`, responseBodyText);
        throw new Error('Resposta inválida da API FocusNFe.');
    }
}

function mapPaymentMethodToCode(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('dinheiro')) return '01';
    if (desc.includes('crédito')) return '03';
    if (desc.includes('débito')) return '04';
    if (desc.includes('pix')) return '17';
    if (desc.includes('vale refeição')) return '11';
    if (desc.includes('vale alimentação')) return '10';
    return '99'; // Outros
}
