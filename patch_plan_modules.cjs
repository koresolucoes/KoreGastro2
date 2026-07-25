const fs = require('fs');
let code = fs.readFileSync('src/components/admin/admin-dashboard.component.ts', 'utf8');

const importStatement = `import { NotificationService } from '../../services/notification.service';
import { ALL_PERMISSION_KEYS } from '../../config/permissions';

const PERMISSION_LABELS: Record<string, string> = {
  '/dashboard': 'Painel Gerencial',
  '/home': 'Início',
  '/pos': 'PDV Frente de Caixa',
  '/kds': 'KDS (Cozinha)',
  '/ifood-kds': 'KDS (iFood)',
  '/cashier': 'Controle de Caixa',
  '/inventory': 'Estoque e Matéria-Prima',
  '/requisitions': 'Requisições Internas',
  '/purchasing': 'Compras',
  '/suppliers': 'Fornecedores',
  '/customers': 'Clientes e Fidelidade',
  '/menu': 'Cardápio',
  '/menu-builder': 'Construtor de Cardápio / QR Code',
  '/ifood-menu': 'Gestão de Cardápio iFood',
  '/ifood-store-manager': 'Gerenciador de Loja iFood',
  '/technical-sheets': 'Fichas Técnicas',
  '/mise-en-place': 'Mise-En-Place / Produção',
  '/performance': 'Desempenho da Equipe',
  '/reports': 'Relatórios Gerenciais',
  '/employees': 'Gestão de Funcionários',
  '/schedules': 'Escalas de Trabalho',
  '/my-leave': 'Portal de Licenças',
  '/my-profile': 'Meu Perfil',
  '/payroll': 'Folha de Pagamento',
  '/settings': 'Configurações',
  '/reservations': 'Reservas de Mesas',
  '/time-clock': 'Relógio de Ponto',
  '/leave-management': 'Gestão de Licenças',
  '/tutorials': 'Tutoriais',
  '/delivery': 'Delivery Próprio',
  '/checklists': 'Checklists de Qualidade',
  '/temperatures': 'Controle de Temperaturas',
  '/whatsapp-chats': 'Integração WhatsApp'
};`;

code = code.replace(/import \{ NotificationService \} from '\.\.\/\.\.\/services\/notification\.service';/, importStatement);

const oldPlanModules = `  planModules = [
    { key: 'tables', label: 'Gestão de Mesas' },
    { key: 'pdv', label: 'PDV & Frente de Caixa' },
    { key: 'kitchen', label: 'KDS (Cozinha)' },
    { key: 'waiter', label: 'App do Garçom' },
    { key: 'delivery', label: 'Delivery Próprio' },
    { key: 'ifood', label: 'Integração iFood' },
    { key: 'financial', label: 'Gestão Financeira' },
    { key: 'inventory', label: 'Estoque Avançado' },
    { key: 'loyalty', label: 'Fidelidade' }
  ];`;

const newPlanModules = `  planModules = ALL_PERMISSION_KEYS.map(key => ({
    key: key,
    label: PERMISSION_LABELS[key] || key
  }));`;

code = code.replace(oldPlanModules, newPlanModules);
fs.writeFileSync('src/components/admin/admin-dashboard.component.ts', code);
console.log('Fixed plan modules.');
