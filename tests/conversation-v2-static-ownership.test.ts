import {describe,expect,it} from "vitest";
import {readFileSync,readdirSync} from "node:fs";
import {join} from "node:path";

describe("V2 static ownership",()=>{
  it("exports no state mutation API outside the reducer",()=>{const root=join(process.cwd(),"lib","conversation-v2"),files=readdirSync(root).filter(name=>name.endsWith(".ts")&&name!=="reducer.ts");for(const file of files){const source=readFileSync(join(root,file),"utf8");expect(source,`${file} exports a mutation API`).not.toMatch(/export\s+(?:async\s+)?function\s+(?:mutate|setState|applyTransition|transitionState)/);}});
  it("keeps state schemas readonly and shadow explicitly effect-free",()=>{const schema=readFileSync(join(process.cwd(),"lib","conversation-v2","schema.ts"),"utf8"),shadow=readFileSync(join(process.cwd(),"lib","conversation-v2","shadow.ts"),"utf8");expect(schema.match(/\.readonly\(\)/g)?.length).toBeGreaterThan(8);expect(shadow).toContain("sideEffects:false");expect(shadow).not.toMatch(/supabase|fetch\(|deliver\(|generateStoredDocumentPdf|createAgentDraft/);});
});
