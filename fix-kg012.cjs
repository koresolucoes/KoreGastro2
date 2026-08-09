const fs = require('fs');
let content = fs.readFileSync('api/whatsapp/webhook.ts', 'utf8');

const reservationCheck = `
    const reservationTime = new Date(\`\${date}T\${time}:00-03:00\`);
    const endWindow = new Date(reservationTime.getTime() + 2 * 60 * 60 * 1000);

    const { data: overlapping, error } = await supabase.from("reservations")
      .select('id, party_size')
      .eq('user_id', storeId)
      .gte('reservation_time', reservationTime.toISOString())
      .lt('reservation_time', endWindow.toISOString())
      .neq('status', 'CANCELADA');
      
    let totalSeatsReserved = 0;
    if (overlapping) {
       totalSeatsReserved = overlapping.reduce((acc, curr) => acc + (curr.party_size || 0), 0);
    }
    
    // Arbitrary limit for now: 20 seats
    if (totalSeatsReserved + party_size > 20) {
       return { success: false, error: "Desculpe, não temos disponibilidade para esse número de pessoas nesse horário." };
    }

    const { data, error: insertError } = await supabase.from("reservations").insert({
`;

content = content.replace(
  /const reservationTime = new Date\(`\$\{date\}T\$\{time\}:00-03:00`\);\n\s*const \{ data, error \} = await supabase\.from\("reservations"\)\.insert\(\{/,
  reservationCheck
);

content = content.replace(
  /return \{ success: true, available: true, message: "A princípio temos disponibilidade\. O atendente pode confirmar posteriormente se precisar\." \};/,
  `const startWindow = new Date(\`\${date}T\${time}:00-03:00\`);
    const endWindow = new Date(startWindow.getTime() + 2 * 60 * 60 * 1000);
    const { data: overlapping } = await supabase.from("reservations")
      .select('id, party_size')
      .eq('user_id', storeId)
      .gte('reservation_time', startWindow.toISOString())
      .lt('reservation_time', endWindow.toISOString())
      .neq('status', 'CANCELADA');
    
    let totalSeatsReserved = 0;
    if (overlapping) totalSeatsReserved = overlapping.reduce((acc, curr) => acc + (curr.party_size || 0), 0);
    
    if (totalSeatsReserved + (party_size || 2) > 20) {
       return { success: false, available: false, message: "Não temos disponibilidade para esse horário." };
    }
    return { success: true, available: true, message: "Temos disponibilidade para o horário." };`
);


fs.writeFileSync('api/whatsapp/webhook.ts', content);
