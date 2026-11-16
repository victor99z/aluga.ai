export interface ImovelData {
  ref: string;
  text_description?: string;
  features?: string | Record<string, unknown>;
  id_listing?: string[] | string;
  images?: string[];
  [key: string]: unknown;
}
