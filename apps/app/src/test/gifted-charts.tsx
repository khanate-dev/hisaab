// Jest only: gifted-charts' drawing is hidden from screen readers (the chart wrappers summarise every figure instead),
// and its BarChart leaves an animation timer running past a test's end, which breaks whichever test runs next.
export const BarChart = () => null;
export const PieChart = () => null;
