import { randomUUID } from "crypto";
import { getAdapter } from "../clients/db";
import type { ListingRow } from "../clients/db-adapter";
import type { ImovelData } from "../models/imovel";

export type { ImovelRow, ListingRow, CrawlerRunRow } from "../clients/db-adapter";
export type { ImovelData } from "../models/imovel";

function serializeFeatures(features: ImovelData["features"]): string | null {
  if (features == null) return null;
  return typeof features === "string" ? features : JSON.stringify(features);
}

function serializeImages(images: string[] | undefined): string {
  return JSON.stringify(
    Array.isArray(images) ? images : images ? [images] : [],
  );
}

function finiteOrZero(val: unknown): number {
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

function nonEmptyString(val: unknown): string | undefined {
  return typeof val === "string" && val.trim().length > 0
    ? val.trim()
    : undefined;
}

function extractStructuredFields(featuresJson: string | null): {
  price_aluguel: number;
  price_iptu: number;
  price_condominio: number;
  area_m2: number;
  bedroom: number;
  bathroom: number;
  garage: number;
  neighborhood?: string;
  city?: string;
  property_type?: string;
} {
  const empty = {
    price_aluguel: 0,
    price_iptu: 0,
    price_condominio: 0,
    area_m2: 0,
    bedroom: 0,
    bathroom: 0,
    garage: 0,
  };
  if (!featuresJson) return empty;

  let features: Record<string, unknown>;
  try {
    const parsed = JSON.parse(featuresJson);
    if (!parsed || typeof parsed !== "object") return empty;
    features = parsed as Record<string, unknown>;
  } catch {
    return empty;
  }

  return {
    price_aluguel: finiteOrZero(features.price_aluguel),
    price_iptu: finiteOrZero(features.price_iptu),
    price_condominio: finiteOrZero(features.price_condominio),
    area_m2: finiteOrZero(features.area_m2),
    bedroom: finiteOrZero(features.bedroom),
    bathroom: finiteOrZero(features.bathroom),
    garage: finiteOrZero(features.garage),
    neighborhood: nonEmptyString(features.neighborhood),
    city: nonEmptyString(features.city),
    property_type: nonEmptyString(features.propertyType),
  };
}

export class ImoveisRepository {
  static async create(imovelData: ImovelData) {
    const ref = imovelData.ref?.trim();
    if (!ref) {
      throw new Error("Imovel ref is required");
    }

    const { text_description, features, id_listing, images } = imovelData;
    const now = new Date();
    const featuresJson = serializeFeatures(features);
    const imagesJson = serializeImages(images);
    const idListingStr = Array.isArray(id_listing)
      ? (id_listing[0] ?? null)
      : (id_listing ?? null);
    const structured = extractStructuredFields(featuresJson);
    const db = getAdapter();

    const payload = {
      textDescription: text_description ?? null,
      features: featuresJson,
      idListing: idListingStr,
      images: imagesJson,
      updated: now,
      priceAluguel: structured.price_aluguel,
      priceIptu: structured.price_iptu,
      priceCondominio: structured.price_condominio,
      areaM2: structured.area_m2,
      bedroom: structured.bedroom,
      bathroom: structured.bathroom,
      garage: structured.garage,
      neighborhood: structured.neighborhood,
      city: structured.city,
      propertyType: structured.property_type,
    };

    const existing = await db.findImovelByRef(ref);
    if (existing) {
      await db.updateImovel(existing.id, payload);
      return { id: existing.id, ...imovelData, ref };
    }

    const id = randomUUID();
    await db.insertImovel({
      id,
      ref,
      created: now,
      ...payload,
    });
    return { id, ...imovelData, ref };
  }

  static async getListingById(id: string): Promise<ListingRow> {
    const row = await getAdapter().getListingById(id);
    if (!row) throw new Error(`Listing not found: ${id}`);
    return row;
  }

  static async getAllListings(): Promise<ListingRow[]> {
    return getAdapter().getAllListings();
  }

  static async updateListing(id: string, updateData: Record<string, unknown>) {
    await getAdapter().updateListing(id, {
      name: updateData.name as string,
      active:
        typeof updateData.active === "boolean"
          ? updateData.active
          : updateData.active === 1,
      lastPage:
        (updateData.lastPage as number) ??
        (updateData.last_page as number) ??
        1,
      url: (updateData.url as string) ?? null,
      maxPages:
        (updateData.maxPages as number) ??
        (updateData.max_pages as number) ??
        50,
      delayMs:
        (updateData.delayMs as number) ??
        (updateData.delay_ms as number) ??
        2000,
    });
    return { id, ...updateData };
  }

  static async getById(id: string) {
    return getAdapter().getImovelById(id);
  }

  static async getByRef(ref: string) {
    return getAdapter().getImovelsByRef(ref);
  }

  static async update(id: string, updateData: Record<string, unknown>) {
    await getAdapter().patchImovel(id, {
      textDescription: (updateData.text_description as string) ?? null,
      features: serializeFeatures(
        updateData.features as ImovelData["features"],
      ),
      updated: new Date(),
    });
    return { id, ...updateData };
  }

  static async delete(id: string) {
    return getAdapter().deleteImovel(id);
  }

  static async deleteAllInBatch() {
    const deleted = await getAdapter().deleteAllImoveis();
    return { deleted };
  }

  static async deleteInvalidOlxInBatch() {
    const deleted = await getAdapter().deleteInvalidOlxImoveis();
    return { deleted };
  }
}
