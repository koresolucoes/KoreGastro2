import { supabase } from './src/services/supabase-client';
import { v4 as uuidv4 } from 'uuid';
import { environment } from './src/config/environment';

console.log("Supabase URL:", environment.supabaseUrl);
