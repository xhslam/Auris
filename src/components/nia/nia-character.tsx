"use client";

import { useNiaCharacterStyle, type NiaCharacterStyle } from "@/features/nia/nia-character-appearance";

const SHELL = "M304 0H449V67H604V154H694V280H754V405H716Q708 405 708 413V517H634V294H592V200Q592 190 580 190H499V238H255V196Q255 190 248 190H172Q162 190 162 198V294H120V517H46V413Q46 405 38 405H0V280H60V154H150V67H304Z";
const FACE = "M120 557V299Q120 294 125 294H162V198Q162 190 172 190H248Q255 190 255 196V238H499V190H580Q592 190 592 200V294H629Q634 294 634 299V557Z";
const FEET = "M173 545H270V591Q270 598 263 598H180Q173 598 173 591ZM484 545H571Q581 545 581 553V590Q581 598 571 598H491Q484 598 484 593Z";

/** Shared reference geometry; accessories stay inside each variant's transparent canvas. */
export function NiaCharacter({ animated = false, variant }: { animated?: boolean; variant?: NiaCharacterStyle }) {
  const selected = useNiaCharacterStyle();
  const style = variant ?? selected;
  const eyeClass = (side: string) => animated ? `nia-companion__eye nia-companion__eye--${side}` : undefined;
  const outlined = style === "outlined";
  const happy = style === "happy";
  const calm = style === "calm";
  return (
    <svg aria-hidden="true" className="nia-character" data-variant={style} viewBox={style === "academic" || calm ? "-16 -140 786 754" : "-16 -16 786 630"} xmlns="http://www.w3.org/2000/svg">
      {style === "explorer" ? <g fill="#7f923e" stroke="#53622b" strokeWidth="14" strokeLinejoin="round"><path d="M637 231H697L733 267V505L697 550H637Z" /><path fill="#95a24b" d="M655 334H754V478H655Z" /><path d="M655 379H751" fill="none" /></g> : null}
      <g className={animated ? "nia-companion__body" : undefined} stroke={outlined ? "#4d2d19" : undefined} strokeWidth={outlined ? 24 : undefined} strokeLinejoin="round">
        <path fill="#754e39" d={SHELL} />
        <path fill="#ffecd0" d={FACE} />
        <path fill="#c28a61" d={FEET} />
      </g>
      <g className={animated ? "nia-companion__face" : undefined} fill="#5d3924">
        {happy || calm ? <>
          <path className={eyeClass("left")} d={happy ? "M224 361V347L241 330H263L280 347V361" : "M224 342V356L241 369H263L280 356V342"} fill="none" stroke="#5d3924" strokeWidth="24" strokeLinejoin="round" />
          <path className={eyeClass("right")} d={happy ? "M472 361V347L489 330H511L528 347V361" : "M472 342V356L489 369H511L528 356V342"} fill="none" stroke="#5d3924" strokeWidth="24" strokeLinejoin="round" />
        </> : <>
          <rect className={eyeClass("left")} x="224" y="337" width="58" height="56" />
          <rect className={eyeClass("right")} x="472" y="337" width="58" height="56" />
        </>}
        <rect className={animated ? "nia-companion__mouth" : undefined} x="342" y="385" width="70" height="44" rx="7" />
        {happy ? <g fill="#ffc394"><rect x="151" y="393" width="72" height="50" rx="8" /><rect x="537" y="393" width="72" height="50" rx="8" /></g> : null}
        {style === "sporty" ? <g stroke="#5d3924" strokeWidth="22" strokeLinejoin="round"><path d="M203 310L272 350M551 310L482 350" /></g> : null}
      </g>
      {style === "focused" ? <g stroke="#4c2e19" strokeWidth="22" strokeLinejoin="round"><path fill="none" strokeWidth="58" d="M55 365V214L90 133L160 74L242 42H512L594 74L664 133L699 214V365" /><path fill="none" stroke="#ffca51" strokeWidth="38" d="M55 365V214L90 133L160 74L242 42H512L594 74L664 133L699 214V365" /><path fill="#ffd05a" d="M40 244H119V436H40L14 410V270ZM635 244H714L740 270V410L714 436H635Z" /></g> : null}
      {style === "academic" ? <g strokeLinejoin="round"><path fill="#37302c" d="M222 7V-62H532V7L377 53Z" /><path fill="#51433b" stroke="#352a25" strokeWidth="10" d="M138-98L377-176L620-98L377-20Z" transform="translate(0 43)" /><path stroke="#ffca3b" strokeWidth="28" d="M602-53V68" /><rect fill="#ffd34e" x="584" y="48" width="36" height="68" rx="8" /></g> : null}
      {style === "coding" ? <g stroke="#817a71" strokeWidth="8" strokeLinejoin="round"><rect fill="#c28a61" x="119" y="501" width="516" height="48" rx="8" /><rect fill="#8e8b84" x="185" y="392" width="384" height="198" rx="16" /><rect fill="#cfcdc5" stroke="none" x="350" y="469" width="54" height="50" rx="6" /><path d="M183 567H571" /></g> : null}
      {style === "sporty" ? <g fill="#df5430"><path d="M88 190H666V247H88Z" /><path fill="#ee6841" d="M137 190H568V247H137Z" /><path d="M666 190H763V226H690L763 244V279H666Z" /></g> : null}
      {calm ? <g fill="#94aa4e" stroke="#7f963d" strokeWidth="12" strokeLinejoin="round"><path d="M362 17V-76H302L275-103V-132H317L351-101V-70M377-65H429L458-94V-132H421L391-103V-65" /><path d="M364-70V29" fill="none" strokeWidth="24" /></g> : null}
      {style === "sparkle" ? <path fill="#ffce50" stroke="#ffe5a0" strokeWidth="4" strokeLinejoin="round" d="M684 28L702 75L750 94L702 113L684 160L666 113L618 94L666 75Z" /> : null}
    </svg>
  );
}
