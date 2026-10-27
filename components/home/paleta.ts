// Colores de la escena 3D, tomados del sistema visual de Factory (app/globals.css):
// papel de fondo, azul de acción para lo seleccionado, amarillo de marca en los montacargas,
// y los mismos rojo / verde de estado que el resto de la app.
export const PALETA = {
  fondo: "#f5f5f7", piso: "#fbfbfd", base: "#e4e4ea", linea: "#a8c8f5", raya: "#ffffff",
  muro: "#ffffff", banda: "#8e8e95", pisoNave: "#d9dadf", pisoNaveSel: "#d6e6fb", pisoTaller: "#f6ecd9",
  amarillo: "#f2a900", franjaOscura: "#1d1d1f", poste: "#3e5c9a", viga: "#d9774a",
  madera: "#d6b07a", carton: "#d9b486", emplaye: "#cdd3dc", cargador: "#6e6e73", pantalla: "#0071e3",
  letrero: "#1d4fa8", rotuloOk: "#1f6f43", rotuloParo: "#b3262b", banco: "#6e6e73", gabinete: "#3a3a3c",
  cuerpo: "#f2a900", paro: "#e5484d", renta: "#5e5ce6", ok: "#2f9e62", torretaOk: "#34c759",
  estructura: "#48484a", estructuraClara: "#8e8e93", asiento: "#2c2c2e", rin: "#aeaeb2", llanta: "#1d1d1f",
  sel: "#0071e3", selSuave: "#e3eefc", arbol: "#9ccb9f",
  luz: 1.45, ambiente: 0.35, env: 0.45, ao: 2.6,
};

/** Modo oscuro (el del prototipo): carbón neutro con acento menta; los estados se conservan. */
export const PALETA_OSCURA: typeof PALETA = {
  fondo: "#0f1112", piso: "#171a1c", base: "#0b0d0e", linea: "#3dd6ac", raya: "#23282b",
  muro: "#24292c", banda: "#141719", pisoNave: "#1b1f22", pisoNaveSel: "#173029", pisoTaller: "#2b2124",
  amarillo: "#ca8a04", franjaOscura: "#0b0e16", poste: "#2b3f7a", viga: "#9a4a2a",
  madera: "#5e4a33", carton: "#5a4b3c", emplaye: "#3a4246", cargador: "#30373b", pantalla: "#3dd6ac",
  letrero: "#1f5f86", rotuloOk: "#0f7a5f", rotuloParo: "#b3243f", banco: "#3e464b", gabinete: "#24292c",
  cuerpo: "#c99a2e", paro: "#ff5a5f", renta: "#a78bfa", ok: "#3dd6ac", torretaOk: "#3dd6ac",
  estructura: "#3e464b", estructuraClara: "#5c656a", asiento: "#0a0d18", rin: "#5c656a", llanta: "#05070d",
  sel: "#3dd6ac", selSuave: "#13302a", arbol: "#1e3a33",
  luz: 1.1, ambiente: 0.35, env: 0.35, ao: 3.4,
};

export type Paleta = typeof PALETA & { quieto: boolean; oscuro?: boolean };
