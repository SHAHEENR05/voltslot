import{c as m,j as s}from"./index-CHOfqUgf.js";import{C as p}from"./Card-Cpzebg9R.js";import{A as h}from"./arrow-up-right-D1sh8HpC.js";/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=m("ArrowDownRight",[["path",{d:"m7 7 10 10",key:"1fmybs"}],["path",{d:"M17 7v10H7",key:"6fjiku"}]]);/**
 * @license lucide-react v0.453.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=m("Minus",[["path",{d:"M5 12h14",key:"1ays0h"}]]);function u({value:a,suffix:o="%",invert:e}){if(a==null||Number.isNaN(a))return null;const i=a>.05,r=a<-.05,c=(e?r:i)?"up":(e?i:r)?"down":"flat",t=i?h:r?x:j;return s.jsxs("span",{className:`delta ${c}`,children:[s.jsx(t,{size:14}),Math.abs(a).toFixed(1),o]})}function b({label:a,value:o,icon:e,delta:i,invertDelta:r,hint:n,spark:l,children:c,className:t="",onClick:d}){return s.jsxs(p,{className:`kpi ${t}`,hover:!!d,clickable:!!d,onClick:d,children:[s.jsxs("div",{className:"row between start",children:[s.jsx("div",{className:"kpi-label",children:a}),e&&s.jsx("div",{className:"kpi-icon",children:e})]}),s.jsx("div",{className:"kpi-value",children:o}),s.jsxs("div",{className:"kpi-foot",children:[s.jsxs("div",{className:"row gap-6",children:[i!==void 0&&s.jsx(u,{value:i,invert:r}),n&&s.jsx("span",{className:"muted xs",children:n})]}),l]}),c]})}export{x as A,u as D,b as K};
