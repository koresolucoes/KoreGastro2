import re

with open("src/components/support-client/support-client.component.ts", "r") as f:
    content = f.read()

content = content.replace("this.notificationService.alert('Aviso de Segurança (RLS): O seu banco de dados precisa que as políticas de segurança da tabela \"support_tickets\" sejam configuradas. Por favor, acesse o painel do Supabase e rode o script SQL mais recente.', 10000);", "this.notificationService.alert('O seu banco de dados precisa que as políticas de segurança (RLS) sejam configuradas para criar chamados. Acesse o painel do Supabase e rode o script SQL.', 'Aviso de Segurança');")

content = content.replace("this.notificationService.alert('Erro de Permissão. O banco de dados precisa ser atualizado com as políticas corretas no Supabase.', 10000);", "this.notificationService.alert('O banco de dados precisa ser atualizado com as políticas corretas no Supabase.', 'Erro de Permissão (RLS)');")

with open("src/components/support-client/support-client.component.ts", "w") as f:
    f.write(content)
