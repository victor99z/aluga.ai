export interface RawListing {
  title: string;
  href: string;
  address: string;
  price_aluguel_raw: string;
  price_iptu_raw: string;
  img_href: string;
}

export interface ImovelFeatures {
  price_aluguel: number;
  address?: string;
  title?: string;
  propertyType?: string;
  area_m2?: number;
  bedroom?: number;
  bathroom?: number;
  garage?: number;
  neighborhood?: string;
  city?: string;
  price_iptu?: number;
  price_condominio?: number;
  listingCode?: string;
  [key: string]: unknown;
}
