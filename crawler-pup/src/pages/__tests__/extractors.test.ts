import { describe, test, expect } from "bun:test";
import {
  buildQueryPageUrl,
  extractCityFromRegion,
  parseJsonLdBlocks,
  resolveListingUrl,
} from "../extractors";
import { mapImoveisScCard } from "../imoveis-sc";
import { isValidOlxImovelUrl, mapOlxCard } from "../olx-imoveis";
import { mapVivarealCard } from "../vivareal-imoveis";

describe("extractors utilities", () => {
  test("buildQueryPageUrl sets or updates query parameter safely", () => {
    const buildPg = buildQueryPageUrl("pg");
    expect(
      buildPg("https://www.chavesnamao.com.br/apartamentos-para-alugar/sc-joinville/", 3),
    ).toBe(
      "https://www.chavesnamao.com.br/apartamentos-para-alugar/sc-joinville/?pg=3",
    );

    const buildO = buildQueryPageUrl("o");
    expect(buildO("https://www.olx.com.br/imoveis?f=p", 2)).toBe(
      "https://www.olx.com.br/imoveis?f=p&o=2",
    );
  });

  test("resolveListingUrl handles relative and absolute URLs", () => {
    expect(
      resolveListingUrl("/imovel/apto-123", "https://www.imoveis-sc.com.br/joinville"),
    ).toBe("https://www.imoveis-sc.com.br/imovel/apto-123");
    expect(
      resolveListingUrl("https://sc.olx.com.br/apto-1", "https://www.olx.com.br"),
    ).toBe("https://sc.olx.com.br/apto-1");
    expect(resolveListingUrl("   ", "https://www.olx.com.br")).toBe("");
  });

  test("extractCityFromRegion returns trimmed city segment", () => {
    expect(extractCityFromRegion("SC, Joinville")).toBe("Joinville");
    expect(extractCityFromRegion("Joinville, SC")).toBe("Joinville");
    expect(extractCityFromRegion("Joinville")).toBe("Joinville");
    expect(extractCityFromRegion("")).toBeUndefined();
  });
});

describe("parseJsonLdBlocks", () => {
  test("extracts listings, images, and falls back to title parsing", () => {
    const blocks = [
      {
        "@type": "RealEstateListing",
        offers: {
          itemListElement: [
            {
              url: "https://www.chavesnamao.com.br/imovel/123/",
              name: "Apartamento para alugar com 1 vaga em Bairro América, Joinville",
              price: "2.350,00",
              image: ["https://cdn.example.com/1.jpg", { url: "https://cdn.example.com/2.jpg" }],
              itemOffered: {
                numberOfBedrooms: 2,
                numberOfBathroomsTotal: 1,
                floorSize: { unitText: "74 m²" },
                address: {
                  addressLocality: "América",
                  addressRegion: "SC, Joinville",
                },
              },
            },
            {
              url: "",
              name: "Invalid without url",
              itemOffered: { address: { addressLocality: "Centro" } },
            },
          ],
        },
      },
    ];

    const listings = parseJsonLdBlocks(blocks);
    expect(listings.length).toBe(1);
    expect(listings[0]?.ref).toBe("https://www.chavesnamao.com.br/imovel/123/");
    expect(listings[0]?.features.price_aluguel).toBe(2350);
    expect(listings[0]?.features.area_m2).toBe(74);
    expect(listings[0]?.features.bedroom).toBe(2);
    expect(listings[0]?.features.bathroom).toBe(1);
    expect(listings[0]?.features.garage).toBe(1);
    expect(listings[0]?.features.propertyType).toBe("Apartamento");
    expect(listings[0]?.features.neighborhood).toBe("América");
    expect(listings[0]?.features.city).toBe("Joinville");
    expect(listings[0]?.images).toEqual([
      "https://cdn.example.com/1.jpg",
      "https://cdn.example.com/2.jpg",
    ]);
  });

  test("handles @graph blocks and fallback RealEstateListing without offers", () => {
    const blocks = [
      {
        "@graph": [
          {
            "@type": "RealEstateListing",
            url: "https://www.zapimoveis.com.br/imovel/999",
            name: "Casa para alugar com 3 quartos em Centro",
            contentLocation: "Centro",
            image: "https://cdn.zap.com/a.jpg",
          },
        ],
      },
    ];

    const listings = parseJsonLdBlocks(blocks);
    expect(listings.length).toBe(1);
    expect(listings[0]?.ref).toBe("https://www.zapimoveis.com.br/imovel/999");
    expect(listings[0]?.features.propertyType).toBe("Casa");
    expect(listings[0]?.features.bedroom).toBe(3);
    expect(listings[0]?.features.neighborhood).toBe("Centro");
    expect(listings[0]?.images).toEqual(["https://cdn.zap.com/a.jpg"]);
  });

  test("extracts ItemList schema used by Zap, VivaReal, and Imoveis SC", () => {
    const blocks = [
      {
        "@type": "ItemList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            item: {
              "@type": "Product",
              name: "Apartamento para alugar com 51 m², 2 quartos, 1 banheiro, 1 vaga em Santo Antônio, Joinville",
              url: "https://www.zapimoveis.com.br/imovel/2918869467/",
              image: ["https://resizedimgs.zapimoveis.com.br/1.webp"],
              address: {
                "@type": "PostalAddress",
                addressLocality: "Joinville",
                addressRegion: "SC",
              },
              numberOfBedrooms: 2,
              numberOfBathroomsTotal: 1,
              floorSize: { value: 51 },
              offers: {
                price: 2390,
                additionalProperty: { name: "Condominium Fee", value: 340 },
              },
            },
          },
        ],
      },
    ];

    const listings = parseJsonLdBlocks(blocks);
    expect(listings.length).toBe(1);
    expect(listings[0]?.features.price_aluguel).toBe(2390);
    expect(listings[0]?.features.price_condominio).toBe(340);
    expect(listings[0]?.features.area_m2).toBe(51);
    expect(listings[0]?.features.bedroom).toBe(2);
    expect(listings[0]?.features.bathroom).toBe(1);
    expect(listings[0]?.features.garage).toBe(1);
    expect(listings[0]?.features.neighborhood).toBe("Santo Antônio");
    expect(listings[0]?.features.city).toBe("Joinville");
    expect(listings[0]?.images).toEqual(["https://resizedimgs.zapimoveis.com.br/1.webp"]);
  });
});

describe("DOM card mappers", () => {
  test("mapOlxCard extracts rent, condo/IPTU, city, neighborhood and features", () => {
    const listing = mapOlxCard({
      title: "Apartamento 3 quartos no Santo Antônio",
      href: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-1467581086",
      address: "Joinville, Santo Antônio",
      price: "R$ 2.500",
      extraPrice: "55 metros quadrados 55m² 3 quartos 1 banheiro 1 vaga Condomínio R$ 200 IPTU R$ 56",
      image: "https://img.olx.com.br/thumbs700x500/69/693680726108953.webp",
    });

    expect(listing).not.toBeNull();
    expect(listing?.features.price_aluguel).toBe(2500);
    expect(listing?.features.price_condominio).toBe(200);
    expect(listing?.features.price_iptu).toBe(56);
    expect(listing?.features.area_m2).toBe(55);
    expect(listing?.features.propertyType).toBe("Apartamento");
    expect(listing?.features.bedroom).toBe(3);
    expect(listing?.features.bathroom).toBe(1);
    expect(listing?.features.garage).toBe(1);
    expect(listing?.features.city).toBe("Joinville");
    expect(listing?.features.neighborhood).toBe("Santo Antônio");
    expect(listing?.images).toEqual([
      "https://img.olx.com.br/thumbs700x500/69/693680726108953.webp",
    ]);
  });

  test("mapOlxCard rejects recommendation/non-imoveis ads and strips tracking query/hash", () => {
    expect(
      isValidOlxImovelUrl("https://www.olx.com.br/vi/1553488450?rec=l&custom_tag=x"),
    ).toBe(false);
    expect(
      isValidOlxImovelUrl("https://www.olx.com.br/eletronicos/xbox-series-s-123"),
    ).toBe(false);
    expect(
      isValidOlxImovelUrl("https://notolx.com.br/imoveis/apto-123"),
    ).toBe(false);
    expect(
      isValidOlxImovelUrl("https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-123?rec=1"),
    ).toBe(false);
    expect(
      isValidOlxImovelUrl("https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-123?utm_source=feed#details"),
    ).toBe(true);

    expect(
      mapOlxCard({
        title: "Xbox Series S + 2 Controles",
        href: "https://www.olx.com.br/vi/1553488450?rec=l&custom_tag=abc",
        address: "Palhoça - SC",
        price: "R$ 1.800",
        extraPrice: "",
        image: "https://img.olx.com.br/xbox.webp",
      }),
    ).toBeNull();

    expect(
      mapOlxCard({
        title: "iPhone 14 Pro Max - 128GB",
        href: "https://www.olx.com.br/celulares/iphone-14-pro-max-1553510706",
        address: "João Pessoa - PB",
        price: "R$ 4.500",
        extraPrice: "",
        image: "https://img.olx.com.br/iphone.webp",
      }),
    ).toBeNull();

    const validWithParams = mapOlxCard({
      title: "Apartamento 2 quartos Centro",
      href: "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-1467581086?utm_source=olx#top",
      address: "Joinville, Centro",
      price: "R$ 2.100",
      extraPrice: "",
      image: "https://img.olx.com.br/apto.webp",
    });
    expect(validWithParams).not.toBeNull();
    expect(validWithParams?.ref).toBe(
      "https://sc.olx.com.br/norte-de-santa-catarina/imoveis/apto-1467581086",
    );
  });

  test("mapImoveisScCard resolves relative hrefs and parses title", () => {
    const listing = mapImoveisScCard({
      title: "Apartamento no Bairro Saguaçú em Joinville com 2 Dormitórios e 43 m² - 05432.001",
      href: "/imovel/05432",
      address: "Saguaçú",
      price: "R$ 1.850,00",
      extraPrice: "",
      image: "https://cdn.imoveis-sc.com.br/img.jpg",
    });

    expect(listing?.ref).toBe("https://www.imoveis-sc.com.br/imovel/05432");
    expect(listing?.features.price_aluguel).toBe(1850);
    expect(listing?.features.area_m2).toBe(43);
    expect(listing?.features.bedroom).toBe(2);
    expect(listing?.features.neighborhood).toBe("Saguaçú");
  });

  test("mapVivarealCard skips cards with empty href and parses valid cards", () => {
    expect(
      mapVivarealCard({
        title: "Sem link",
        href: "",
        address: "",
        price: "R$ 1.000",
        extraPrice: "",
        image: "",
      }),
    ).toBeNull();

    const valid = mapVivarealCard({
      title: "Apartamento para alugar com 2 quartos e 1 vaga, 65 m² em Bairro Atiradores, Joinville",
      href: "/imovel/vr-1",
      address: "Atiradores, Joinville",
      price: "R$ 3.100,00",
      extraPrice: "Condomínio R$ 520",
      image: "https://vr.img/1.jpg",
    });
    expect(valid?.ref).toBe("https://www.vivareal.com.br/imovel/vr-1");
    expect(valid?.features.price_aluguel).toBe(3100);
    expect(valid?.features.price_condominio).toBe(520);
    expect(valid?.features.bedroom).toBe(2);
    expect(valid?.features.garage).toBe(1);
  });
});
