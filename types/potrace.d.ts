declare module "potrace" {
  type Callback = (err: Error | null, svg: string) => void;

  interface TraceOptions {
    turdSize?: number;
    turnPolicy?: string;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
  }

  interface PosterizeOptions extends TraceOptions {
    steps?: number | number[];
    fillStrategy?: string;
    rangeDistribution?: string;
  }

  type Source = Buffer | string;

  class Potrace {
    static readonly THRESHOLD_AUTO: number;
  }

  function trace(source: Source, options: TraceOptions, cb: Callback): void;
  function trace(source: Source, cb: Callback): void;
  function posterize(
    source: Source,
    options: PosterizeOptions,
    cb: Callback,
  ): void;
  function posterize(source: Source, cb: Callback): void;

  export { Potrace, trace, posterize, TraceOptions, PosterizeOptions };
  const _default: {
    Potrace: typeof Potrace;
    trace: typeof trace;
    posterize: typeof posterize;
  };
  export default _default;
}
