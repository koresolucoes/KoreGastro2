
-- Tabela para cache de sistema (Tokens, Configurações voláteis)
CREATE TABLE IF NOT EXISTS system_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Função para limpar cache expirado (manutenção)
CREATE OR REPLACE FUNCTION clean_system_cache()
RETURNS void AS $$
BEGIN
  DELETE FROM system_cache WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
