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
} as const;

export type Paleta = typeof PALETA & { quieto: boolean };
