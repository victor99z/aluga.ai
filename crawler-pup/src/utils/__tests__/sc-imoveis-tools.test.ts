import { describe, test, expect } from "bun:test";
import { parseScTitle } from "../sc-imoveis-tools";

describe("parseScTitle", () => {
  test("extracts property type, area, bedrooms, code", () => {
    const title =
      "Apartamento no Bairro Saguaçú em Joinville com 2 Dormitórios e 43 m² - 05432.001";
    const result = parseScTitle(title);

    expect(result.propertyType).toBe("Apartamento");
    expect(result.area_m2).toBe(43);
    expect(result.bedroom).toBe(2);
    expect(result.listingCode).toBe("05432.001");
    expect(result.city).toBe("Joinville");
    expect(result.address).toBe("Saguaçú em Joinville com 2 Dormitórios e 43 m");
  });

  test("extracts bathrooms and garage", () => {
    const title =
      "Casa no Bairro Centro em Florianópolis com 3 Banheiros e 2 vagas - 12345";
    const result = parseScTitle(title);

    expect(result.propertyType).toBe("Casa");
    expect(result.bathroom).toBe(3);
    expect(result.garage).toBe(2);
    expect(result.city).toBe("Florianópolis");
  });

  test("handles title without code", () => {
    const title =
      "Sala comercial no Bairro Centro em Joinville com 1 Dormitório e 25 m²";
    const result = parseScTitle(title);

    expect(result.propertyType).toBe("Sala comercial");
    expect(result.area_m2).toBe(25);
    expect(result.bedroom).toBe(1);
    expect(result.listingCode).toBeUndefined();
  });

  test("returns title in result object", () => {
    const title = "Apartamento em Joinville - 001";
    const result = parseScTitle(title);
    expect(result.title).toBe(title);
  });

  test("handles quartos synonym", () => {
    const title = "Casa em Joinville com 4 quartos e 120 m²";
    const result = parseScTitle(title);
    expect(result.bedroom).toBe(4);
  });

  test("handles decimal area", () => {
    const title = "Apartamento em Joinville com 85,5 m²";
    const result = parseScTitle(title);
    expect(result.area_m2).toBe(85.5);
  });
});
