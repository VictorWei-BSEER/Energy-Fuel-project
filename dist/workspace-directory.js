import { AIRPORT_DIRECTORY } from "./airport-directory.js";
import { airportData } from "./global-airports.js";

const countries = {
  CN: "China",
  JP: "Japan",
  KR: "South Korea",
  SG: "Singapore",
  HK: "Hong Kong",
  MY: "Malaysia",
  TH: "Thailand",
  PH: "Philippines",
  TW: "Taiwan",
  VN: "Vietnam",
};

const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

function safeSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Populate the retained Sources directory without requiring the old planning
 * map or its selection controls. These records are geographic/traffic context,
 * not an expanded list of quoted or optimizable airports.
 */
export function renderWorkspaceDirectory(root = document) {
  const method = root.querySelector("#directory-method");
  const rows = root.querySelector("#directory-rows");
  const sources = root.querySelector("#directory-sources");
  // The legacy network workspace owns its own initializer. Do not duplicate it.
  if (!root.querySelector("#flight-map") || !method || !rows || !sources) {
    return false;
  }

  const directory = AIRPORT_DIRECTORY;
  method.textContent =
    `参考目录保留 ${directory.airports.length} 个东亚及东南亚主要机场，` +
    `按 ${directory.year} 年旅客吞吐量排序，范围为 92–151°E、6°S–51°N。` +
    `入选下限为 ${directory.minimumAnnualPassengers.toLocaleString("en-US")} 人次。` +
    `本表提供机场位置和客流背景；轮转优化与报价导入支持另行列示的全球 ${airportData.length} 个机场。客流不代表航油价格、供给或需求。`;

  rows.innerHTML = directory.airports
    .map(
      (airport) =>
        `<tr><td>${airport.rank}</td><td>${escape(airport.iata)}</td>` +
        `<td>${escape(airport.name)}</td><td>${escape(airport.city)}</td>` +
        `<td>${airport.annualPassengers.toLocaleString("en-US")}</td>` +
        `<td>${escape(countries[airport.country] || airport.country)}</td></tr>`,
    )
    .join("");

  const references = [
    { title: "OurAirports coordinates", url: "https://ourairports.com/data/" },
    ...Object.values(directory.sources),
  ];
  sources.innerHTML = references
    .flatMap((source) => {
      const url = safeSourceUrl(source.url);
      return url
        ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(source.title)}</a>`
        : [];
    })
    .join("");

  return true;
}

if (typeof document !== "undefined") renderWorkspaceDirectory(document);
