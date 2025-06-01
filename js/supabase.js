// supabase.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://kggaengzxmautimlvcgh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2Flbmd6eG1hdXRpbWx2Y2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NTgzOTEsImV4cCI6MjA2MzIzNDM5MX0.2NFe8_6OnvCjGVueJuVA1cO9zsjYTttID8UR90l9T9Q';
const supabase = createClient(supabaseUrl, supabaseKey);

// Экспортируем как default
export default supabase;