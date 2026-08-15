import {describe,expect,it,vi} from "vitest";
vi.mock("server-only",()=>({}));
import {administrativeVaultLimits} from "@/lib/administrative-vault/config";
import {classifyAdministrativeFile,sanitizeAdministrativeFilename,storeAdministrativeFile} from "@/lib/administrative-vault/files";
import {extractCnpj,isValidCnpj,normalizeCnpj} from "@/lib/domain/cnpj";

describe("CNPJ opcional",()=>{
  it("normaliza e valida dígitos verificadores",()=>{expect(isValidCnpj("11.222.333/0001-81")).toBe(true);expect(normalizeCnpj("11222333000181")).toBe("11.222.333/0001-81");expect(extractCnpj("CNPJ 11.222.333/0001-81, obrigado")).toBe("11.222.333/0001-81");});
  it("rejeita documento inválido",()=>expect(()=>normalizeCnpj("00.000.000/0000-00")).toThrow("INVALID_CNPJ"));
});

describe("Cofre Administrativo",()=>{
  it("usa limites seguros sem configuração",()=>{delete process.env.LUME_FILE_MAX_SIZE_MB;delete process.env.LUME_ORGANIZATION_STORAGE_LIMIT_MB;expect(administrativeVaultLimits()).toMatchObject({maxFileBytes:10*1024*1024,organizationBytes:500*1024*1024});});
  it("sanitiza paths e classifica sem IA",()=>{expect(sanitizeAdministrativeFilename("../../Cartão CNPJ Alfa.pdf")).not.toContain("..");expect(classifyAdministrativeFile({filename:"cartao-cnpj-alfa.pdf",mimeType:"application/pdf"})).toBe("cartão CNPJ");expect(classifyAdministrativeFile({filename:"contrato-alfa.pdf",mimeType:"application/pdf"})).toBe("contrato");});
  it("rejeita MIME perigoso antes do storage",async()=>{const admin={from:vi.fn(),storage:{from:vi.fn()}};await expect(storeAdministrativeFile(admin as never,{organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",filename:"malware.exe",mimeType:"application/x-msdownload",bytes:new Uint8Array([1])})).rejects.toThrow("ADMIN_FILE_TYPE_INVALID");expect(admin.storage.from).not.toHaveBeenCalled();});
  it("rejeita PDF com extensão falsa",async()=>{const admin={from:vi.fn(),storage:{from:vi.fn()}};await expect(storeAdministrativeFile(admin as never,{organizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",filename:"falso.pdf",mimeType:"application/pdf",bytes:new TextEncoder().encode("not-pdf")})).rejects.toThrow("ADMIN_FILE_CORRUPT");});
});
