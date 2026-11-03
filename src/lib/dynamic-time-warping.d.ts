declare module "dynamic-time-warping" {
  export default class DynamicTimeWarping<T> {
    constructor(a: T[], b: T[], distance: (a: T, b: T) => number);
    getDistance(): number;
    getPath(): [number, number][];
  }
}