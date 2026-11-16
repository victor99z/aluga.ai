import { describe, test, expect } from "bun:test";
import {
  titleToJson,
  rawIptuAndCondominioToNumbers,
} from "../zap-imoveis-tools";

describe("titleToJson", () => {
  test("extracts property type, purpose, area, rooms, location", () => {
    const title =
      "Apartamento para alugar com 2 quartos e 1 vaga, 65 m² em Bairro Atiradores, Joinville";
    const result = titleToJson(title);

    expect(result.propertyType).toBe("Apartamento");
    expect(result.purpose).toBe("alugar");
    expect(result.area_m2).toBe(65);
    expect(result.bedroom).toBe(2);
    expect(result.garage).toBe(1);
    expect(result.neighborhood).toBe("Atiradores");
    expect(result.address).toBe("Joinville");
  });

  test("handles single-part location", () => {
    const title =
      "Casa para venda com 3 quartos, 120 m² em Centro";
    const result = titleToJson(title);

    expect(result.propertyType).toBe("Casa");
    expect(result.purpose).toBe("venda");
    expect(result.address).toBe("Centro");
  });

  test("returns title in result", () => {
    const title = "Apartamento para alugar em Joinville";
    const result = titleToJson(title);
    expect(result.title).toBe(title);
  });

  test("ignores trailing codes after dash", () => {
    const title =
      "Apartamento para alugar em Bairro Glória, Joinville - ABC123";
    const result = titleToJson(title);
    expect(result.address).toBe("Joinville");
  });
});

describe("rawIptuAndCondominioToNumbers", () => {
  test("extracts both condomínio and IPTU", () => {
    const raw = "Condomínio: R$ 450,00 / IPTU: R$ 120,00";
    const result = rawIptuAndCondominioToNumbers(raw);

    expect(result.price_condominio).toBe(450);
    expect(result.price_iptu).toBe(120);
  });

  test("extracts condomínio only", () => {
    const raw = "condomínio R$ 380,50";
    const result = rawIptuAndCondominioToNumbers(raw);

    expect(result.price_condominio).toBe(380.5);
    expect(result.price_iptu).toBeUndefined();
  });

  test("extracts IPTU only", () => {
    const raw = "IPTU: 90,00";
    const result = rawIptuAndCondominioToNumbers(raw);

    expect(result.price_iptu).toBe(90);
    expect(result.price_condominio).toBeUndefined();
  });

  test("returns empty object for empty string", () => {
    const result = rawIptuAndCondominioToNumbers("");
    expect(result.price_iptu).toBeUndefined();
    expect(result.price_condominio).toBeUndefined();
  });

  test("handles thousands separator", () => {
    const raw = "Condomínio: R$ 1.234,56";
    const result = rawIptuAndCondominioToNumbers(raw);
    expect(result.price_condominio).toBe(1234.56);
  });
});
