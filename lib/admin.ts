import { revalidatePath } from "next/cache";

/** Nach Änderungen im Dashboard: alle Shop-Seiten neu erzeugen, damit die Änderung sofort sichtbar ist */
export function revalidateShop() {
  revalidatePath("/", "layout");
}
