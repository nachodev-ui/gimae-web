import { CheckoutError } from "./paypal.ts";

export type Delivery = {
  method: "pickup" | "starken_por_pagar";
  details: Record<string, string>;
};

function rutValid(rut: string): boolean {
  const [digits, check] = rut.split("-");
  let sum = 0;
  for (let i = digits.length - 1, factor = 2; i >= 0; i--, factor = factor === 7 ? 2 : factor + 1) {
    sum += Number(digits[i]) * factor;
  }
  const expected = 11 - (sum % 11);
  return check === (expected === 11 ? "0" : expected === 10 ? "K" : String(expected));
}

export function readDelivery(input: Record<string, unknown>): Delivery {
  if (input.shippingId === "pickup") return { method: "pickup", details: {} };
  if (input.shippingId !== "starken_por_pagar") {
    throw new CheckoutError(400, "Selecciona un método de entrega válido.");
  }
  const raw = input.shippingDetails;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CheckoutError(400, "Completa los datos para enviar con Starken.");
  }
  const data = raw as Record<string, unknown>;
  const fields = ["name", "rut", "phone", "email", "region", "commune", "street", "number", "unit", "instructions"];
  if (Object.keys(data).some((key) => !fields.includes(key)) ||
      fields.some((key) => data[key] !== undefined && typeof data[key] !== "string")) {
    throw new CheckoutError(400, "Revisa los datos de envío.");
  }
  const details = Object.fromEntries(fields.map((key) => [key, String(data[key] || "").trim().replace(/\s+/g, " ")]));
  details.rut = details.rut.replace(/\./g, "").toUpperCase();
  details.phone = details.phone.replace(/[\s()-]/g, "");
  if (/^9\d{8}$/.test(details.phone)) details.phone = `+56${details.phone}`;
  if (/^569\d{8}$/.test(details.phone)) details.phone = `+${details.phone}`;
  if (!(details.name.length >= 2 && details.name.length <= 80 &&
      /^[0-9]{7,8}-[0-9K]$/.test(details.rut) && rutValid(details.rut) &&
      /^\+569\d{8}$/.test(details.phone) &&
      details.email.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) &&
      details.region.length >= 3 && details.region.length <= 80 &&
      details.commune.length >= 2 && details.commune.length <= 80 &&
      details.street.length >= 3 && details.street.length <= 120 &&
      details.number.length >= 1 && details.number.length <= 20 &&
      details.unit.length <= 60 && details.instructions.length <= 200)) {
    throw new CheckoutError(400, "Revisa RUT, celular, correo y dirección del destinatario.");
  }
  return { method: "starken_por_pagar", details };
}
