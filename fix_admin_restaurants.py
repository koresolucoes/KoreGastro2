import re

with open("api/v2/admin/restaurants.ts", "r") as f:
    content = f.read()

content = content.replace(
    "const profileMap = new Map(rawProfiles.map(p => [p.id, p]));",
    "const profileMap = new Map<string, any>(rawProfiles.map((p: any) => [p.id, p]));"
)

with open("api/v2/admin/restaurants.ts", "w") as f:
    f.write(content)
