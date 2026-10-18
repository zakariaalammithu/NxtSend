// Form library types are provided by the compatibility modules under
// src/lib/compat, which tsconfig.json maps onto the package names
// ("zod", "react-hook-form", "@hookform/resolvers/zod").
// Ambient module declarations for those packages used to live here, but
// they shadowed the compat modules' real types and caused build errors,
// so they were removed. Do not re-add them.
export {};
