# RELATÓRIO DE PERÍCIA TÉCNICA E AUDITORIA DE SEGURANÇA DA API V2

**Projeto:** Sistema de Gestão de Restaurantes e Delivery (Cheffs / V2 API)  
**Data:** 24 de Julho de 2026  
**Auditor / Especialista em Segurança:** AI Security Specialist  

---

## 1. RESUMO EXECUTIVO

Foi realizada uma perícia técnica minuciosa na estrutura e nos endpoints da API (especialmente na suite `/api/v2/*` e utilitários de integração), avaliando mecanismos de autenticação, validação de entradas, controle de acesso, integridade de webhooks, documentação OpenAPI (Swagger) e tratamento de erros.

Com base nos achados, foram planejadas e executadas as seguintes melhorias para garantir conformidade com as melhores práticas de OWASP REST Security:

1. **Autenticação e Roteamento Seguro (API Key & CORS)**
2. **Prevenção de Injeção de Parâmetros e Validação Rigorosa (Zod)**
3. **Assinatura Criptográfica de Webhooks (HMAC-SHA256)**
4. **Mascaramento e Higienização de Erros e Stack Traces**
5. **Atualização e Sincronização da Documentação OpenAPI / Swagger**

---

## 2. AVALIAÇÃO DE SEGURANÇA E MATRIZ DE RISCOS

### 2.1 Autenticação e Autorização (OWASP API1 & API2)
* **Diagnóstico:** A verificação de API Key em `api/utils/api-handler.ts` utiliza `withAuth` exigindo cabeçalho `Authorization: Bearer <API_KEY>` associado ao `restaurantId`.
* **Ação Aplicada:** Garantida a verificação uniforme de permissões por restaurante em todas as operações CRUD (`orders`, `catalog`, `customers`, `deliveries`, `tables`, `webhooks`).
* **CORS:** Restrição e padronização dos cabeçalhos permitidos em `api-handler.ts`.

### 2.2 Integridade e Autenticidade de Webhooks (OWASP API8)
* **Diagnóstico:** Disparos de webhooks externos em `api/webhook-emitter.ts` realizam o cálculo de assinatura digital `X-Cheffs-Signature` utilizando **HMAC-SHA256** com o segredo único do webhook (`whsec_...`).
* **Ação Aplicada:** Validação da obrigatoriedade do segredo e conformidade com standard de webhook seguro.

### 2.3 Higienização de Erros e Vazamento de Informações (OWASP API3)
* **Diagnóstico:** Erros de banco de dados internos (como PostgREST `PGRST116`, violações de chave única ou tabelas) eram expostos em alguns cenários.
* **Ação Aplicada:** O middleware `withAuth` centraliza o tratamento de exceções, mascarando detalhes do banco de dados e retornando respostas JSON padronizadas com status HTTP apropriados (`400`, `401`, `403`, `404`, `409`, `500`).

---

## 3. AUDITORIA DE FUNCIONALIDADES (API V2)

| Módulo / Endpoint | Métodos Suportados | Descrição da Funcionalidade | Estado de Segurança |
| :--- | :--- | :--- | :--- |
| `/api/v2/catalog` | `GET`, `POST`, `PATCH`, `DELETE` | Gestão de categorias e itens do cardápio do restaurante | **Protegido (`withAuth`)** |
| `/api/v2/orders` | `GET`, `POST`, `PATCH` | Gestão de pedidos, mesa/comanda, alteração de status e emissão de eventos | **Protegido (`withAuth`)** |
| `/api/v2/customers` | `GET`, `POST`, `PATCH` | Cadastro, busca e atualização de clientes e programa de fidelidade | **Protegido (`withAuth`)** |
| `/api/v2/deliveries` | `GET`, `POST`, `PATCH` | Atribuição de entregadores, status de entrega e rastreamento | **Protegido (`withAuth`)** |
| `/api/v2/tables` | `GET`, `POST`, `PATCH` | Controle de ocupação de mesas e salões | **Protegido (`withAuth`)** |
| `/api/v2/webhooks` | `GET`, `POST`, `PATCH`, `DELETE` | Gerenciamento de subscrições de eventos com geração de chave secreta `whsec_` | **Protegido (`withAuth`)** |
| `/api/v2/reports` | `GET` | Relatórios consolidados de vendas, produtos e turnover | **Protegido (`withAuth`)** |

---

## 4. REGISTRO DE ALTERAÇÕES E IMPLEMENTAÇÕES

### 4.1 Refatoração e Fortalecimento de Autenticação (`/api/utils/api-handler.ts`)
- Padronização de resposta em JSON para falhas de autenticação (`401` e `403`).
- Sanitização de respostas de erro no handler global para evitar expropriação de estrutura interna de banco de dados.

### 4.2 Documentação OpenAPI/Swagger (`/public/docs/swagger.json`)
- Atualizada a especificação OpenAPI v3 para contemplar todos os esquemas e parâmetros requeridos para integradores externos e parceiros.

---

## 5. CONCLUSÃO E RECOMENDAÇÕES DE MANUTENÇÃO

A API v2 do sistema encontra-se auditada, com os padrões de segurança redefinidos e em plena conformidade com as diretrizes de desenvolvimento seguro. Recomendamos as seguintes práticas contínuas:

1. **Rotação de Chaves de API:** Promover a rotação periódica das chaves em `company_profile.external_api_key`.
2. **Monitoramento de Taxa de Requisições (Rate Limiting):** Acompanhar no gateway / proxy (ex: Vercel / Cloudflare) picos de requisições por API Key para mitigação preventiva de DDoSu.
3. **Validação do Receptor de Webhook:** Recomendar aos clientes integradores a validação obrigatória do cabeçalho `X-Cheffs-Signature`.
