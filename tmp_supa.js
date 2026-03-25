const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://mjyldmkdcoiyrolggpje.supabase.co';
const supabaseKey = 'sb_publishable_B8Y5rZc4yiHAtmjCXC9C5A_Qt5rZqsM'; // Using the key from server.js
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    console.log("Updating id 48 to is_new = true...");
    const { data: updateData, error: updateError } = await supabase
        .from('recipes')
        .update({ is_new: true })
        .eq('id', 48)
        .select();
    
    console.log("Update Result:", { updateData, updateError });

    const { data: selectData, error: selectError } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', 48);
    
    console.log("Select Result:", { selectData, selectError });
}
test();
