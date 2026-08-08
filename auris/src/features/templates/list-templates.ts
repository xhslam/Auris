import { listStarterTemplates } from "@/server/repositories/template-repository";

export async function listTemplates() {
  return listStarterTemplates();
}
