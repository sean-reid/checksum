import { localIsoDate, puzzleNumber } from "../shared/day.ts";

const main = document.getElementById("main");
const number = puzzleNumber(localIsoDate());
if (main && number !== null && number > 0) {
  const p = document.createElement("p");
  p.className = "issue";
  p.textContent = `No. ${number}`;
  main.append(p);
}
