export type OneDriveCategoryType = "garden" | "funeral_package" | "cremation";

type JardinRef = {
  nombre?: string | null;
};

type LoteRef = {
  numero_lote?: string | null;
  jardin?: JardinRef | null;
};

type CenizarioRef = {
  descripcion?: string | null;
  jardin?: JardinRef | null;
};

type CremacionRef = {
  descripcion?: string | null;
};

type PaqueteRef = {
  descripcion?: string | null;
};

type ProductoLike = {
  tipo_producto: "LOTE" | "CENIZARIO" | "CREMACION" | "PAQUETE_FUNERARIO";
  lote?: LoteRef | null;
  tipo_cenizario?: CenizarioRef | null;
  tipo_cremacion?: CremacionRef | null;
  paquete_funerario?: PaqueteRef | null;
};

type ContratoLike = {
  numero_formulario?: string | null;
  numero_contrato?: string | null;
};

type ClienteLike = {
  nombre_completo?: string | null;
};

export type ContractOneDriveLike = {
  contrato: ContratoLike;
  cliente: ClienteLike | null;
  productos: ProductoLike[];
};

export type OneDriveFolderPayload = {
  clientName: string;
  categoryName: string;
  categoryType: OneDriveCategoryType;
  folderName: string;
};

function uniqueTrimmed(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean))) as string[];
}

export function buildOneDriveProductSummary(record: ContractOneDriveLike): string {
  const summaryParts: string[] = [];

  const lotCount = record.productos.filter((producto) => producto.tipo_producto === "LOTE").length;
  if (lotCount > 0) {
    summaryParts.push(lotCount > 1 ? "Lotes" : "Lote");
  }

  const cenizarioDescriptions = uniqueTrimmed(
    record.productos
      .filter((producto) => producto.tipo_producto === "CENIZARIO")
      .map((producto) => producto.tipo_cenizario?.descripcion),
  );
  if (cenizarioDescriptions.length > 0) {
    summaryParts.push(`Cenizario ${cenizarioDescriptions.join("/")}`.trim());
  }

  const packageDescriptions = uniqueTrimmed(
    record.productos
      .filter((producto) => producto.tipo_producto === "PAQUETE_FUNERARIO")
      .map((producto) => producto.paquete_funerario?.descripcion),
  );
  if (packageDescriptions.length > 0) {
    summaryParts.push(`Paquete ${packageDescriptions.join("/")}`.trim());
  }

  const cremationDescriptions = uniqueTrimmed(
    record.productos
      .filter((producto) => producto.tipo_producto === "CREMACION")
      .map((producto) => producto.tipo_cremacion?.descripcion),
  );
  if (cremationDescriptions.length > 0) {
    summaryParts.push(`Cremacion ${cremationDescriptions.join("/")}`.trim());
  }

  const summary = summaryParts.join(", ");
  return summary.length > 120 ? `${summary.slice(0, 117).trimEnd()}...` : summary;
}

export function getOneDriveFolderName(clientName: string, record: ContractOneDriveLike): string {
  const formNumber =
    record.contrato.numero_formulario?.trim() || record.contrato.numero_contrato?.trim() || "";
  if (!formNumber) {
    throw new Error("No se encontro el numero de formulario para crear la carpeta en OneDrive");
  }

  const productSummary = buildOneDriveProductSummary(record);
  const baseFolderName = `${clientName} - Form ${formNumber}`;
  return productSummary ? `${baseFolderName} - ${productSummary}` : baseFolderName;
}

export function buildOneDriveFolderPayload(record: ContractOneDriveLike): OneDriveFolderPayload {
  const clientName = record.cliente?.nombre_completo?.trim() || "";
  if (!clientName) {
    throw new Error("No se encontro el nombre del cliente del contrato");
  }

  const lotProducts = record.productos.filter(
    (producto) => producto.tipo_producto === "LOTE" && producto.lote?.numero_lote && producto.lote?.jardin?.nombre,
  );

  const cenizarioProducts = record.productos.filter(
    (producto) =>
      producto.tipo_producto === "CENIZARIO" &&
      producto.tipo_cenizario?.jardin?.nombre &&
      producto.tipo_cenizario?.descripcion,
  );

  const funeralPackageProducts = record.productos.filter(
    (producto) => producto.tipo_producto === "PAQUETE_FUNERARIO" && producto.paquete_funerario?.descripcion,
  );

  const cremationProducts = record.productos.filter(
    (producto) => producto.tipo_producto === "CREMACION" && producto.tipo_cremacion?.descripcion,
  );

  if (lotProducts.length === 0 && funeralPackageProducts.length > 0) {
    const packageNames = uniqueTrimmed(
      funeralPackageProducts.map((producto) => producto.paquete_funerario?.descripcion),
    );

    if (packageNames.length !== 1) {
      throw new Error("El contrato tiene varios paquetes funerarios y no se puede construir una ruta unica");
    }

    return {
      clientName,
      categoryName: packageNames[0] ?? "",
      categoryType: "funeral_package",
      folderName: getOneDriveFolderName(clientName, record),
    };
  }

  if (lotProducts.length === 0 && cremationProducts.length > 0) {
    const cremationNames = uniqueTrimmed(
      cremationProducts.map((producto) => producto.tipo_cremacion?.descripcion),
    );

    if (cremationNames.length !== 1) {
      throw new Error("El contrato tiene varios tipos de cremacion y no se puede construir una ruta unica");
    }

    return {
      clientName,
      categoryName: cremationNames[0] ?? "",
      categoryType: "cremation",
      folderName: getOneDriveFolderName(clientName, record),
    };
  }

  if (lotProducts.length === 0 && cenizarioProducts.length > 0) {
    const gardenNames = uniqueTrimmed(
      cenizarioProducts.map((producto) => producto.tipo_cenizario?.jardin?.nombre),
    );

    if (gardenNames.length !== 1) {
      throw new Error(
        "Los cenizarios del contrato pertenecen a jardines distintos y no se puede construir una ruta unica",
      );
    }

    return {
      clientName,
      categoryName: gardenNames[0] ?? "",
      categoryType: "garden",
      folderName: getOneDriveFolderName(clientName, record),
    };
  }

  if (lotProducts.length === 0) {
    throw new Error(
      "Este contrato aun no tiene lotes, cenizario, paquete funerario o cremacion para crear la carpeta en OneDrive",
    );
  }

  const gardenNames = uniqueTrimmed(lotProducts.map((producto) => producto.lote?.jardin?.nombre));

  if (gardenNames.length !== 1) {
    throw new Error("Los lotes del contrato pertenecen a jardines distintos y no se puede construir una ruta unica");
  }

  return {
    clientName,
    categoryName: gardenNames[0] ?? "",
    categoryType: "garden",
    folderName: getOneDriveFolderName(clientName, record),
  };
}
