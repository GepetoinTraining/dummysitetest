// ============================================================
// Golden Ratio spacing — the only design system
//
// φ = 1.618033988749895
// base = 8px
//
// Every spacing value is base × φ^n:
//   8, 13, 21, 34, 55, 89, 144
//
// That's Fibonacci. It's always been Fibonacci.
// ============================================================

export const PHI = 1.618033988749895;
export const BASE = 8;

// Pre-computed spacing scale
export const spacing = {
  xs:   Math.round(BASE),                          // 8
  sm:   Math.round(BASE * PHI),                    // 13
  md:   Math.round(BASE * PHI * PHI),              // 21
  lg:   Math.round(BASE * PHI * PHI * PHI),        // 34
  xl:   Math.round(BASE * PHI ** 4),               // 55
  xxl:  Math.round(BASE * PHI ** 5),               // 89
  xxxl: Math.round(BASE * PHI ** 6),               // 144
} as const;

// For Mantine theme override
export const mantineSpacing = {
  xs: `${spacing.xs}px`,
  sm: `${spacing.sm}px`,
  md: `${spacing.md}px`,
  lg: `${spacing.lg}px`,
  xl: `${spacing.xl}px`,
};
