content = open("E:/Git/winOpenCodeMod/src/aistar.ts", "r", encoding="utf-8").read()
content = content.replace('"X-CSRF-Token": csrf as string,', '"X-CSRF-Token": csrf,')
open("E:/Git/winOpenCodeMod/src/aistar.ts", "w", encoding="utf-8").write(content)
print("Done")