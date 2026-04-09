export type MaterialRef = {
  typeId: number | string | null;
  name: string;
  quantity: number;
};

export type ProductRef = {
  typeId: number | string | null;
  name: string;
  quantity: number;
  manufacturingTime?: number | null;
};

export type AppRecipe = {
  blueprintId: number;
  blueprintName: string;
  outputTypeId: number | string | null;
  outputName: string;
  outputQuantity: number;
  category?: string | null;
  group?: string | null;
  manufacturingTime?: number | null;
  maxProductionLimit?: number | null;
  materials: MaterialRef[];
  products: ProductRef[];
};
