import type { Page } from "puppeteer";
import { parseCurrencyToNumber } from "../utils/number";
import { parseScTitle } from "../utils/sc-imoveis-tools";
import {
  rawIptuAndCondominioToNumbers,
  titleToJson,
} from "../utils/zap-imoveis-tools";
import type { ExtractedListing } from "./base-scraper";

export interface DomCardSelectors {
  cardSelector: string;
  title?: string;
  href?: string;
  address?: string;
  price?: string;
  extraPrice?: string;
  image?: string;
}

export interface RawDomCard {
  title: string;
  href: string;
  address: string;
  price: string;
  extraPrice: string;
  image: string;
}

export function buildQueryPageUrl(paramName: string) {
  return (base: string, page: number): string => {
    const url = new URL(base);
    url.searchParams.set(paramName, String(page));
    return url.toString();
  };
}

export function resolveListingUrl(rawHref: string, baseUrl: string): string {
  const trimmed = rawHref.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return "";
  }
}

export function inferPropertyType(text: string): string | undefined {
  const match = text.match(
    /\b(apartamento|apto|casa|kitnet|studio|sobrado|geminado|cobertura|terreno|sala|galp[aã]o|quarto|ch[aá]cara|s[ií]tio)\b/i,
  );
  if (!match?.[1]) return undefined;
  const word = match[1].toLowerCase();
  if (word === "apto") return "Apartamento";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function extractCityFromRegion(region: unknown): string | undefined {
  if (typeof region !== "string" || !region.trim()) return undefined;
  const parts = region
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return undefined;
  const last = parts[parts.length - 1]!;
  if (parts.length >= 2 && /^[A-Z]{2}$/i.test(last)) {
    return parts[parts.length - 2];
  }
  return last;
}

function isStateCode(val: string | undefined): boolean {
  return typeof val === "string" && /^[A-Z]{2}$/.test(val.trim());
}

function collectImageUrls(source: unknown, acc: Set<string>): void {
  if (!source) return;
  if (typeof source === "string") {
    const trimmed = source.trim();
    if (trimmed) acc.add(trimmed);
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) collectImageUrls(item, acc);
    return;
  }
  if (typeof source === "object") {
    const obj = source as Record<string, unknown>;
    collectImageUrls(obj.url ?? obj.contentUrl ?? obj.src, acc);
  }
}

function normalizeImages(...sources: unknown[]): string[] {
  const acc = new Set<string>();
  for (const src of sources) collectImageUrls(src, acc);
  return [...acc];
}

function toFiniteNumber(val: unknown): number | undefined {
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (typeof val === "string") {
    const n = parseCurrencyToNumber(val);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function parseArea(floorSize: unknown): number | undefined {
  if (!floorSize || typeof floorSize !== "object") return undefined;
  const sizeObj = floorSize as Record<string, unknown>;
  if (typeof sizeObj.value === "number" && Number.isFinite(sizeObj.value)) {
    return sizeObj.value;
  }
  const match = String(sizeObj.unitText ?? sizeObj.value ?? "").match(
    /(\d+(?:[.,]\d+)?)/,
  );
  if (!match?.[1]) return undefined;
  const parsed = parseFloat(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractAreaFromSlug(url: string): number | undefined {
  const match = url.match(/[-/](\d+(?:[.,]\d+)?)m2?\b/i);
  if (!match?.[1]) return undefined;
  const n = parseFloat(match[1].replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

export interface AdditionalPropertyFields {
  price_condominio?: number;
  price_iptu?: number;
  area_m2?: number;
  bedroom?: number;
  bathroom?: number;
  garage?: number;
}

/**
 * Extracts structured numeric attributes (condomínio, IPTU, area, rooms, garage)
 * from schema.org `additionalProperty` / `PropertyValue` entries.
 */
export function extractAdditionalPropertyFields(
  additionalProperty: unknown,
): AdditionalPropertyFields {
  const result: AdditionalPropertyFields = {};
  if (!additionalProperty) return result;
  const list = Array.isArray(additionalProperty)
    ? additionalProperty
    : [additionalProperty];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const name = String(obj.name ?? "").toLowerCase();
    if (name.includes("condom")) {
      result.price_condominio ??= toFiniteNumber(obj.value);
    } else if (name.includes("iptu")) {
      result.price_iptu ??= toFiniteNumber(obj.value);
    } else if (
      name.includes("área útil") ||
      name.includes("area util") ||
      name.includes("área privativa") ||
      name.includes("area privativa")
    ) {
      result.area_m2 ??= toFiniteNumber(obj.value);
    } else if (name.includes("quarto") || name.includes("dormit")) {
      result.bedroom ??= toFiniteNumber(obj.value);
    } else if (name.includes("banheiro")) {
      result.bathroom ??= toFiniteNumber(obj.value);
    } else if (name.includes("vaga") || name.includes("garagem")) {
      result.garage ??= toFiniteNumber(obj.value);
    }
  }
  return result;
}

export function flattenJsonLdBlocks(
  blocks: unknown[],
): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = [];
  const pushBlock = (entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    if (Array.isArray(entry)) {
      for (const item of entry) pushBlock(item);
      return;
    }
    const obj = entry as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) {
      for (const graphItem of obj["@graph"]) pushBlock(graphItem);
    }
    result.push(obj);
  };

  for (const b of blocks) pushBlock(b);
  return result;
}

function extractNeighborhoodFromTitle(text: string): string | undefined {
  const match = text.match(
    /\bbairro\s+([A-Za-zÀ-ÿ0-9\s\-]+?)(?=\s+(?:em|com|para|pra|por|dispon[ií]vel|pr[oó]ximo|compost[oa]|contendo|mobiliad[oa]|semimobiliad[oa])\b|\s*[,.\-|!?:]|$)/i,
  );
  return match?.[1]?.trim() || undefined;
}

function extractLocationFields(
  address: Record<string, unknown> | undefined,
  titleText: string,
): { neighborhood?: string; city?: string } {
  const titleParsed = titleText ? titleToJson(titleText) : {};
  const scParsed = titleText ? parseScTitle(titleText) : {};
  const explicitBairro = titleText
    ? extractNeighborhoodFromTitle(titleText)
    : undefined;

  const addrLocality =
    typeof address?.addressLocality === "string" && address.addressLocality.trim()
      ? address.addressLocality.trim()
      : undefined;
  const regionCity = extractCityFromRegion(address?.addressRegion);

  const city =
    (!isStateCode(regionCity) ? regionCity : undefined) ??
    titleParsed.city ??
    scParsed.city ??
    addrLocality;

  const scAddr =
    scParsed.address && scParsed.address !== scParsed.listingCode
      ? scParsed.address
      : undefined;

  const neighborhood =
    explicitBairro ??
    titleParsed.neighborhood ??
    (addrLocality && addrLocality !== city ? addrLocality : undefined) ??
    scAddr;

  return { neighborhood, city };
}

function pickPositive(
  primary: number | undefined,
  secondary: number | undefined,
): number | undefined {
  if (typeof primary === "number" && Number.isFinite(primary) && primary > 0) {
    return primary;
  }
  if (
    typeof secondary === "number" &&
    Number.isFinite(secondary) &&
    secondary > 0
  ) {
    return secondary;
  }
  return primary ?? secondary;
}

function pickString(
  primary: string | undefined,
  secondary: string | undefined,
): string | undefined {
  const p = typeof primary === "string" ? primary.trim() : "";
  if (p) return p;
  const s = typeof secondary === "string" ? secondary.trim() : "";
  return s || undefined;
}

function mergeTwoListings(
  base: ExtractedListing,
  incoming: ExtractedListing,
): ExtractedListing {
  return {
    ref: base.ref,
    text_description:
      pickString(base.text_description, incoming.text_description) ?? "",
    features: {
      ...incoming.features,
      ...base.features,
      price_aluguel:
        pickPositive(
          base.features.price_aluguel,
          incoming.features.price_aluguel,
        ) ?? 0,
      price_condominio: pickPositive(
        base.features.price_condominio,
        incoming.features.price_condominio,
      ),
      price_iptu: pickPositive(
        base.features.price_iptu,
        incoming.features.price_iptu,
      ),
      area_m2: pickPositive(base.features.area_m2, incoming.features.area_m2),
      bedroom: pickPositive(base.features.bedroom, incoming.features.bedroom),
      bathroom: pickPositive(
        base.features.bathroom,
        incoming.features.bathroom,
      ),
      garage: pickPositive(base.features.garage, incoming.features.garage),
      propertyType: pickString(
        base.features.propertyType,
        incoming.features.propertyType,
      ),
      neighborhood:
        pickString(base.features.neighborhood, incoming.features.neighborhood) ??
        "",
      city: pickString(base.features.city, incoming.features.city),
      address: pickString(base.features.address, incoming.features.address),
      title: pickString(base.features.title, incoming.features.title),
    },
    images:
      base.images && base.images.length > 0
        ? base.images
        : (incoming.images ?? []),
  };
}

/**
 * Merges primary extracted listings (e.g. JSON-LD) with secondary listings
 * (e.g. DOM cards) by `ref`, filling missing or zero fields without overwriting
 * valid non-zero values.
 */
export function mergeListingsWithDom(
  primary: ExtractedListing[],
  secondary: ExtractedListing[],
): ExtractedListing[] {
  const byRef = new Map<string, ExtractedListing>();
  for (const item of primary) {
    const existing = byRef.get(item.ref);
    byRef.set(item.ref, existing ? mergeTwoListings(existing, item) : item);
  }
  for (const item of secondary) {
    const existing = byRef.get(item.ref);
    byRef.set(item.ref, existing ? mergeTwoListings(existing, item) : item);
  }
  return [...byRef.values()];
}

export function parseJsonLdBlocks(blocks: unknown[]): ExtractedListing[] {
  const listings: ExtractedListing[] = [];

  for (const block of flattenJsonLdBlocks(blocks)) {
    const type = block["@type"];

    if (type === "ItemList" && Array.isArray(block.itemListElement)) {
      for (const listEl of block.itemListElement) {
        if (!listEl || typeof listEl !== "object") continue;
        const listObj = listEl as Record<string, unknown>;
        const item =
          listObj.item && typeof listObj.item === "object"
            ? (listObj.item as Record<string, unknown>)
            : listObj;

        const offers =
          item.offers && typeof item.offers === "object"
            ? (item.offers as Record<string, unknown>)
            : undefined;

        const ref = String(item.url || listObj.url || offers?.url || "").trim();
        if (!ref) continue;

        const textDescription = String(item.name || "").trim();
        const keywords =
          typeof item.keywords === "string" ? item.keywords : textDescription;
        const titleParsed = titleToJson(keywords);
        const scParsed = parseScTitle(textDescription);
        const address =
          item.address && typeof item.address === "object"
            ? (item.address as Record<string, unknown>)
            : undefined;
        const loc = extractLocationFields(address, keywords);

        const descStr =
          typeof item.description === "string" ? item.description : "";
        const extraPrices = rawIptuAndCondominioToNumbers(
          `${descStr} ${textDescription}`.trim(),
        );
        const offerProps = extractAdditionalPropertyFields(
          offers?.additionalProperty,
        );
        const itemProps = extractAdditionalPropertyFields(
          item.additionalProperty,
        );

        const price = toFiniteNumber(offers?.price) ?? 0;

        listings.push({
          ref,
          text_description: textDescription,
          features: {
            price_aluguel: price,
            price_condominio:
              offerProps.price_condominio ??
              itemProps.price_condominio ??
              extraPrices.price_condominio,
            price_iptu:
              offerProps.price_iptu ??
              itemProps.price_iptu ??
              extraPrices.price_iptu,
            propertyType:
              (typeof item.model === "string" ? item.model : undefined) ??
              titleParsed.propertyType ??
              inferPropertyType(textDescription),
            area_m2:
              parseArea(item.floorSize) ??
              itemProps.area_m2 ??
              offerProps.area_m2 ??
              titleParsed.area_m2 ??
              scParsed.area_m2 ??
              extractAreaFromSlug(ref),
            bedroom:
              toFiniteNumber(item.numberOfBedrooms) ??
              itemProps.bedroom ??
              offerProps.bedroom ??
              titleParsed.bedroom ??
              scParsed.bedroom,
            bathroom:
              toFiniteNumber(item.numberOfBathroomsTotal) ??
              itemProps.bathroom ??
              offerProps.bathroom ??
              titleParsed.bathroom ??
              scParsed.bathroom,
            garage:
              itemProps.garage ??
              offerProps.garage ??
              titleParsed.garage ??
              scParsed.garage,
            neighborhood: loc.neighborhood ?? "",
            city: loc.city,
          },
          images: normalizeImages(item.image),
        });
      }
      continue;
    }

    if (type !== "RealEstateListing") continue;

    if (!block.offers && !block.itemOffered) {
      const ref = typeof block.url === "string" ? block.url.trim() : "";
      const description =
        typeof block.name === "string" ? block.name.trim() : "";
      if (!ref || (!description && typeof block.contentLocation !== "string")) {
        continue;
      }
      const titleParsed = description ? titleToJson(description) : {};
      listings.push({
        ref,
        text_description: description,
        features: {
          price_aluguel: 0,
          propertyType:
            titleParsed.propertyType ?? inferPropertyType(description),
          area_m2: titleParsed.area_m2 ?? extractAreaFromSlug(ref),
          bedroom: titleParsed.bedroom,
          bathroom: titleParsed.bathroom,
          garage: titleParsed.garage,
          neighborhood:
            typeof block.contentLocation === "string"
              ? block.contentLocation
              : titleParsed.neighborhood,
          city: titleParsed.city,
        },
        images: normalizeImages(block.image),
      });
      continue;
    }

    const pairs: Array<{
      node: Record<string, unknown>;
      apartment: Record<string, unknown> | null;
    }> = [];

    const offers = block.offers as Record<string, unknown> | undefined;
    if (offers && Array.isArray(offers.itemListElement)) {
      for (const offer of offers.itemListElement) {
        if (!offer || typeof offer !== "object") continue;
        const offerObj = offer as Record<string, unknown>;
        const apt =
          offerObj.itemOffered && typeof offerObj.itemOffered === "object"
            ? (offerObj.itemOffered as Record<string, unknown>)
            : null;
        pairs.push({ node: offerObj, apartment: apt });
      }
    }

    if (block.itemOffered) {
      const items = Array.isArray(block.itemOffered)
        ? block.itemOffered
        : [block.itemOffered];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const itemObj = item as Record<string, unknown>;
        const apt =
          itemObj.itemOffered && typeof itemObj.itemOffered === "object"
            ? (itemObj.itemOffered as Record<string, unknown>)
            : itemObj;
        pairs.push({ node: itemObj, apartment: apt });
      }
    }

    for (const { node, apartment } of pairs) {
      if (!apartment?.address) continue;
      const address = apartment.address as Record<string, unknown>;
      const ref = String(node.url || apartment.url || "").trim();
      if (!ref) continue;

      const textDescription = String(node.name || apartment.name || "").trim();
      const titleParsed = textDescription ? titleToJson(textDescription) : {};
      const scParsed = textDescription ? parseScTitle(textDescription) : {};
      const loc = extractLocationFields(address, textDescription);
      const parsedPrice = toFiniteNumber(node.price) ?? 0;

      const descText = [
        typeof node.description === "string" ? node.description : "",
        typeof apartment.description === "string" ? apartment.description : "",
        typeof block.description === "string" ? block.description : "",
        textDescription,
      ]
        .filter(Boolean)
        .join(" ");
      const extraPrices = rawIptuAndCondominioToNumbers(descText);
      const nodeProps = extractAdditionalPropertyFields(
        node.additionalProperty,
      );
      const aptProps = extractAdditionalPropertyFields(
        apartment.additionalProperty,
      );
      const blockProps = extractAdditionalPropertyFields(
        block.additionalProperty,
      );

      listings.push({
        ref,
        text_description: textDescription,
        features: {
          price_aluguel: parsedPrice,
          price_condominio:
            nodeProps.price_condominio ??
            aptProps.price_condominio ??
            blockProps.price_condominio ??
            extraPrices.price_condominio,
          price_iptu:
            nodeProps.price_iptu ??
            aptProps.price_iptu ??
            blockProps.price_iptu ??
            extraPrices.price_iptu,
          propertyType:
            titleParsed.propertyType ?? inferPropertyType(textDescription),
          area_m2:
            parseArea(apartment.floorSize) ??
            aptProps.area_m2 ??
            nodeProps.area_m2 ??
            blockProps.area_m2 ??
            titleParsed.area_m2 ??
            scParsed.area_m2 ??
            extractAreaFromSlug(ref),
          bedroom:
            toFiniteNumber(apartment.numberOfBedrooms) ??
            aptProps.bedroom ??
            nodeProps.bedroom ??
            blockProps.bedroom ??
            titleParsed.bedroom ??
            scParsed.bedroom,
          bathroom:
            toFiniteNumber(apartment.numberOfBathroomsTotal) ??
            aptProps.bathroom ??
            nodeProps.bathroom ??
            blockProps.bathroom ??
            titleParsed.bathroom ??
            scParsed.bathroom,
          garage:
            aptProps.garage ??
            nodeProps.garage ??
            blockProps.garage ??
            titleParsed.garage ??
            scParsed.garage,
          neighborhood: loc.neighborhood ?? "",
          city: loc.city,
        },
        images: normalizeImages(node.image, apartment.image),
      });
    }
  }

  return mergeListingsWithDom(listings, []);
}

export async function extractJsonLdListings(
  page: Page,
  waitMs = 1500,
): Promise<ExtractedListing[]> {
  if (waitMs > 0) {
    await page.evaluate(
      (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      waitMs,
    );
  }

  const blocks = await page.evaluate(() => {
    const scripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]'),
    );
    return scripts
      .map((el) => {
        try {
          return JSON.parse(el.textContent ?? "{}");
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  });

  return parseJsonLdBlocks(blocks);
}

export async function extractDomCards(
  page: Page,
  selectors: DomCardSelectors,
): Promise<RawDomCard[]> {
  return page.$$eval(
    selectors.cardSelector,
    (elements, sel) => {
      const readText = (el: Element, query?: string): string => {
        if (!query) return "";
        return el.querySelector(query)?.textContent?.trim() ?? "";
      };

      const readAllText = (el: Element, query?: string): string => {
        if (!query) return "";
        return Array.from(el.querySelectorAll(query))
          .flatMap((n) => [
            n.getAttribute("aria-label")?.trim() ?? "",
            n.textContent?.trim() ?? "",
          ])
          .filter(Boolean)
          .join(" ");
      };

      return elements.map((el) => {
        const hrefEl = sel.href ? el.querySelector(sel.href) : null;
        const href =
          hrefEl?.getAttribute("href") ??
          (el.tagName === "A" ? el.getAttribute("href") : null) ??
          "";

        const imgEl = sel.image ? el.querySelector(sel.image) : null;
        const image =
          imgEl?.getAttribute("src") ?? imgEl?.getAttribute("data-src") ?? "";

        return {
          title: readText(el, sel.title),
          href: href.trim(),
          address: readText(el, sel.address),
          price: readText(el, sel.price),
          extraPrice: readAllText(el, sel.extraPrice),
          image: image.trim(),
        };
      });
    },
    selectors,
  );
}

export async function extractDomListings(
  page: Page,
  selectors: DomCardSelectors,
  mapper: (raw: RawDomCard) => ExtractedListing | null,
): Promise<ExtractedListing[]> {
  const raws = await extractDomCards(page, selectors);
  return raws
    .map((raw) => mapper(raw))
    .filter((item): item is ExtractedListing => item !== null && item.ref.length > 0);
}
