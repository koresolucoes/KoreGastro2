
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'buffer';
import { Order, CompanyProfile, Recipe, Transaction } from '../src/models/db.models.js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const focusNFeBaseUrl = 'https://homologacao.focusnfe.com.br'; // Use 'https://api.focusnfe.com.br' for production

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
                await handleSaveSettings(res, restaurantId, profile.focusnfe_token, payload);
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

async function handleSaveSettings(res: VercelResponse, userId: string, currentToken: string | null, payload: any) {
    const { token, certificateBase64, certificatePassword } = payload;
    
    if (token) {
        await supabase.from('company_profile').update({ focusnfe_token: token }).eq('user_id', userId);
    }
    
    const tokenToUse = token || currentToken;

    if (!tokenToUse) {
        throw new Error('FocusNFe token is required to upload certificate.');
    }

    let certValidUntil: string | null = null;
    if (certificateBase64 && certificatePassword) {
        const certPayload = {
            "arquivo_certificado_base64": certificateBase64,
            "senha_certificado": certificatePassword
        };
        const response = await callFocusNFeApi('POST', '/v2/certificates', tokenToUse, certPayload);
        certValidUntil = response.validade; // Assuming 'validade' is the field from FocusNFe
        await supabase.from('company_profile').update({ focusnfe_cert_valid_until: certValidUntil }).eq('user_id', userId);
    }

    return res.status(200).json({ data: { message: 'Settings saved.', cert_valid_until: certValidUntil } });
}


async function handleEmitNfce(res: VercelResponse, userId: string, cnpj: string, token: string | null, payload: any) {
    if (!token) throw new Error('FocusNFe Token not configured.');
    if (!cnpj) throw new Error('Company CNPJ not configured.');

    const { orderId } = payload;
    if (!orderId) throw new Error('`orderId` is required.');

    const [orderRes, recipesRes, transactionsRes] = await Promise.all([
        supabase.from('orders').select('*, customers(cpf)').eq('id', orderId).single(),
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
    
    // Store reference before sending
    await supabase.from('orders').update({ nfce_ref: orderId }).eq('id', orderId);

    const response = await callFocusNFeApi('POST', `/v2/nfce?ref=${orderId}`, token, nfcePayload);
    
    const updatePayload = {
        nfce_status: response.status,
        nfce_url: response.caminho_danfe ? `${focusNFeBaseUrl}${response.caminho_danfe}` : null,
        nfce_xml_path: response.caminho_xml_nota_fiscal ? `${focusNFeBaseUrl}${response.caminho_xml_nota_fiscal}` : null,
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

    const response = await callFocusNFeApi('DELETE', `/v2/nfce/${order.nfce_ref}`, token, { justificativa: justification });
    
    const updatePayload = {
        nfce_status: response.status,
        nfce_last_response: response as any,
        nfce_xml_path: response.caminho_xml_cancelamento ? `${focusNFeBaseUrl}${response.caminho_xml_cancelamento}` : null,
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

    // FIX: The CNPJ consultation endpoint uses the production URL, not the homologation one.
    const url = `https://api.focusnfe.com.br/v2/cnpjs/${sanitizedCnpj}`;
    const encodedToken = Buffer.from(`${token}:`).toString('base64');

    const apiResponse = await fetch(url, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${encodedToken}`,
        },
    });

    const responseBody = await apiResponse.json();

    if (!apiResponse.ok) {
        console.error(`FocusNFe CNPJ API Error (${apiResponse.status}):`, responseBody);
        const errorMessage = responseBody.mensagem || responseBody.message || 'Erro ao consultar CNPJ na FocusNFe.';
        throw new Error(errorMessage);
    }
    
    return res.status(200).json({ data: responseBody });
}

// --- Helpers ---

async function callFocusNFeApi(method: 'GET' | 'POST' | 'PUT' | 'DELETE', endpoint: string, token: string, body?: any): Promise<any> {
    const url = `${focusNFeBaseUrl}${endpoint}`;
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
    const responseBody = await response.json();

    if (!response.ok) {
        // Log the full error but throw a cleaner message
        console.error(`FocusNFe API Error (${response.status}) on ${method} ${endpoint}:`, responseBody);
        const errorMessage = responseBody.mensagem_sefaz || responseBody.mensagem || JSON.stringify(responseBody);
        throw new Error(`Erro na API FocusNFe: ${errorMessage}`);
    }

    return responseBody;
}

function mapPaymentMethodToCode(description: string): string {
    if (description.includes('Dinheiro')) return '01';
    if (description.includes('Crédito')) return '03';
    if (description.includes('Débito')) return '04';
    if (description.includes('PIX')) return '17';
    if (description.includes('Vale Refeição')) return '11';
    if (description.includes('Vale Alimentação')) return '10';
    return '99'; // Outros
}
