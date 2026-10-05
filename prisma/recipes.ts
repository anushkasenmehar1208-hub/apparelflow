// Wastage caps are percentage points: 5 means 5%, 8 means 8%.
export const requiredRecipes = [
  {
    recipeCode: "REC-BL01", name: "Casual Blouse", category: "Blouse",
    stdFabricYards: "1.80", wastageCap: "5.00",
    components: [
      { componentName: "Front Body Panel", piecesPerGarment: 1 },
      { componentName: "Back Body Panel", piecesPerGarment: 1 },
      { componentName: "Sleeves (Left & Right)", piecesPerGarment: 2 },
      { componentName: "Collar & Stand", piecesPerGarment: 1 },
      { componentName: "Sleeve Cuffs", piecesPerGarment: 2 },
    ],
  },
  {
    recipeCode: "REC-CT02", name: "Crop Top", category: "Crop Top",
    stdFabricYards: "1.10", wastageCap: "8.00",
    components: [
      { componentName: "Front Chest Panel", piecesPerGarment: 1 },
      { componentName: "Back Support Panel", piecesPerGarment: 1 },
      { componentName: "Neck Binding Strip", piecesPerGarment: 1 },
      { componentName: "Hem Elastic Casing", piecesPerGarment: 1 },
      { componentName: "Side Strap Accents", piecesPerGarment: 2 },
    ],
  },
];
