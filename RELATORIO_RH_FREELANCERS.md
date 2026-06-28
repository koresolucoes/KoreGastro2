# Relatório de Análise e Propostas de Melhorias: RH e Gestão de Freelancers (Extras)

Com base na arquitetura atual do **ChefOS** (que já conta com Cadastro de Funcionários, Ponto Eletrônico, Escalas de Turnos e Gestão de Permissões), elaboramos um levantamento de funcionalidades estratégicas para escalar a gestão de Recursos Humanos, com foco especial na dinâmica de restaurantes, que depende fortemente de **Freelancers (Extras)**.

Abaixo, detalhamos as funcionalidades que podem ser adicionadas, divididas entre a Gestão de Freelancers e a Gestão de Funcionários Fixos (CLT/Horistas).

---

## 1. Módulo de Gestão de Freelancers (Extras)

Restaurantes lidam com alta rotatividade de "extras" para cobrir finais de semana, feriados e eventos. O sistema atual não diferencia totalmente a jornada e as necessidades financeiras desse perfil.

### Funcionalidades Propostas:
*   **Cadastro Simplificado (Talent Pool):**
    *   Criação de um tipo de contrato `Freelancer/Extra`.
    *   Campos otimizados: Nome, Telefone (WhatsApp), Chave PIX, Função principal (Garçom, Barman, Copa) e Valor Padrão da Diária.
    *   *Benefício:* Rapidez na contratação temporária sem poluir a folha de pagamento oficial com dados desnecessários.
*   **Sistema de Convocação e Escala (Call-out via WhatsApp):**
    *   Ao montar a escala de um dia movimentado, o gerente pode enviar um convite (via integração WhatsApp já existente) para uma lista de freelancers cadastrados.
    *   O freelancer responde "Sim" e o sistema já o aloca na Escala (Shifts) do dia.
*   **Acerto de Conta Diário (Pagamento Expresso):**
    *   Freelancers geralmente recebem no fim do turno.
    *   Criar um fluxo no **Fechamento de Caixa** ou em uma tela de "Acerto de Extras", onde o gerente visualiza quem fez o turno, soma o valor da diária + caixinha/taxa de serviço rateada, e registra o pagamento (marcando como "Pago via PIX").
    *   Integração direta com o módulo de `transactions` (Financeiro), debitando automaticamente do caixa.
*   **Sistema de Avaliação Pós-Turno (Rating):**
    *   Ao fechar o ponto de um freelancer, o gerente pode dar uma nota rápida de 1 a 5 estrelas e adicionar tags (ex: *Pontual*, *Proativo*, *Não chamar mais*).
    *   *Benefício:* Cria um ranking interno de confiança, priorizando os melhores profissionais nas próximas convocações.

---

## 2. Melhorias para Funcionários Fixos (RH Avançado)

Para os colaboradores regulares (Mensalistas/Horistas), o objetivo é reduzir o trabalho administrativo e aumentar a transparência financeira.

### Funcionalidades Propostas:
*   **Gestão de Vales e Consumo Interno (Fiado):**
    *   Permitir que funcionários consumam refeições no estabelecimento (com desconto de funcionário) ou peçam vales/adiantamentos.
    *   Esses valores vão para uma "Conta Corrente" do funcionário, sendo descontados automaticamente no fechamento da folha no final do mês.
*   **Rateio de Taxa de Serviço (Gorjetas/Tronco):**
    *   Motor de cálculo para rateio dos 10%.
    *   Distribuição baseada em sistema de pontos por cargo (ex: Garçom = 10 pts, Cozinheiro = 8 pts, Auxiliar = 5 pts) cruzado com o número de horas trabalhadas no `TimeClockEntry` dentro do período.
*   **Banco de Horas, Atrasos e Absenteísmo:**
    *   Painel que compara a Escala Prevista (`Shifts`) com o Ponto Realizado (`TimeClockEntry`).
    *   Cálculo automático de Horas Extras, Horas Negativas (atrasos) e Faltas não justificadas.
*   **Gestão de Documentos e Avisos (Compliance):**
    *   Upload de ASOs (Atestado de Saúde Ocupacional) com alertas de vencimento.
    *   Registro de Advertências e Suspensões aplicadas, mantendo um histórico disciplinar completo.
*   **Módulo de Onboarding (Trilha de Aprendizado):**
    *   Vincular o módulo de `tutorials` existente a perfis de cargos.
    *   Ao contratar um novo funcionário, o sistema exige que ele conclua (e assine digitalmente) a leitura dos manuais de Boas Práticas (ex: manipulação de alimentos, padrão de atendimento) antes de liberar seu PIN de acesso ao PDV.

---

## 3. Próximos Passos (Plano de Ação)

Se desejar prosseguir com a implementação, podemos adotar a seguinte ordem de prioridade para gerar o maior impacto rapidamente:

1.  **Fase 1 (Quick Win):** Adicionar a categoria `Freelancer/Extra` no cadastro, incluir campo de Chave PIX e criar a tela de **Acerto de Extras** associada ao caixa.
2.  **Fase 2:** Implementar a **Gestão de Vales/Consumo** e integração do desconto automático para funcionários fixos.
3.  **Fase 3:** Motor de **Rateio de Gorjetas** (cálculo complexo baseado em horas x pontos).
4.  **Fase 4:** Avaliação 5 estrelas e disparos via WhatsApp para convocação.

**Deseja que eu inicie o desenvolvimento da Fase 1 (Cadastro e Acerto de Extras) ou quer ajustar as prioridades deste relatório?**
