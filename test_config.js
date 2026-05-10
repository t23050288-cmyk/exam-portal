const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://boaabpntqggfhjrbpqjs.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvYWFicG50cWdnZmhqcmJwcWpzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzcwNDE5NCwiZXhwIjoyMDkzMjgwMTk0fQ.YrXoPCkRVg8SK0_e9p-snsCTJmq88pwzcHYc2Tv6lSA');
async function run() {
  const { data, error } = await supabase.from('exam_config').upsert({ exam_title: 'PYHUNT_GLOBAL_CONFIG', category: JSON.stringify({test: "value"}), is_active: true }, { onConflict: 'exam_title' }).select();
  console.log('insert result:', data, error?.message);
}
run();
