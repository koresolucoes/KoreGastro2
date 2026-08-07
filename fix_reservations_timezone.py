import os
import re

def fix_ts_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = re.sub(
        r"new Date\(\(start_date as string\) \+ 'T00:00:00Z'\)\.toISOString\(\)",
        r"new Date(Date.UTC(...(start_date as string).split('-').map(Number) as [number, number, number])).toISOString()",
        content
    )
    # The previous regex didn't handle the month - 1 part. Let's just do it manually with a string replacement.
    
def manual_fix():
    path = 'api/v2/reservations.ts'
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # We want to replace:
    # .gte('reservation_time', new Date((start_date as string) + 'T00:00:00Z').toISOString())
    # .lte('reservation_time', new Date((end_date as string) + 'T23:59:59.999Z').toISOString());
    # With strict UTC construction
    
    old_str = """.gte('reservation_time', new Date((start_date as string) + 'T00:00:00Z').toISOString())
            .lte('reservation_time', new Date((end_date as string) + 'T23:59:59.999Z').toISOString());"""
            
    new_str = """const [sY, sM, sD] = (start_date as string).split('-').map(Number);
        const [eY, eM, eD] = (end_date as string).split('-').map(Number);
        let query = supabase.from('reservations').select('*').eq('user_id', restaurantId).is('deleted_at', null)
            .gte('reservation_time', new Date(Date.UTC(sY, sM - 1, sD, 0, 0, 0, 0)).toISOString())
            .lte('reservation_time', new Date(Date.UTC(eY, eM - 1, eD, 23, 59, 59, 999)).toISOString());"""
            
    # We need to replace the whole let query = ... block
    old_block = """        let query = supabase.from('reservations').select('*').eq('user_id', restaurantId).is('deleted_at', null)
            .gte('reservation_time', new Date((start_date as string) + 'T00:00:00Z').toISOString())
            .lte('reservation_time', new Date((end_date as string) + 'T23:59:59.999Z').toISOString());"""
            
    content = content.replace(old_block, new_str)
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed reservations.ts")

if __name__ == '__main__':
    manual_fix()
