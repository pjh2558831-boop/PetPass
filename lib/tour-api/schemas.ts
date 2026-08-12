import { z } from "zod";

const providerStringSchema = z
  .union([z.string(), z.number()])
  .transform(String)
  .nullable()
  .optional();

export const tourItemSchema = z
  .object({
    contentid: providerStringSchema,
    contenttypeid: providerStringSchema,
    title: providerStringSchema,
    addr1: providerStringSchema,
    addr2: providerStringSchema,
    mapx: providerStringSchema,
    mapy: providerStringSchema,
    tel: providerStringSchema,
    firstimage: providerStringSchema,
    firstimage2: providerStringSchema,
    createdtime: providerStringSchema,
    modifiedtime: providerStringSchema,
    cpyrhtDivCd: providerStringSchema,
    areacode: providerStringSchema,
    sigungucode: providerStringSchema,
    lDongRegnCd: providerStringSchema,
    lDongSignguCd: providerStringSchema,
    ldongregncd: providerStringSchema,
    ldongsigngucd: providerStringSchema,
    cat1: providerStringSchema,
    cat2: providerStringSchema,
    cat3: providerStringSchema,
    lclsSystm1: providerStringSchema,
    lclsSystm2: providerStringSchema,
    lclsSystm3: providerStringSchema,
    lclssystm1: providerStringSchema,
    lclssystm2: providerStringSchema,
    lclssystm3: providerStringSchema,
    overview: providerStringSchema,
    homepage: providerStringSchema,
    showflag: providerStringSchema,
    acmpyTypeCd: providerStringSchema,
    acmpyPsblCpam: providerStringSchema,
    acmpyNeedMtr: providerStringSchema,
    etcAcmpyInfo: providerStringSchema,
    relaAcdntRiskMtr: providerStringSchema,
    relaPosesFclty: providerStringSchema,
    relaFrnshPrdlst: providerStringSchema,
    relaPurcPrdlst: providerStringSchema,
    relaRntlPrdlst: providerStringSchema,
  })
  .catchall(providerStringSchema);

export const tourEnvelopeSchema = z.object({
  response: z.object({
    header: z.object({
      resultCode: z.union([z.string(), z.number()]).transform(String),
      resultMsg: z.union([z.string(), z.number()]).transform(String).default(""),
    }),
    body: z
      .object({
        items: z.unknown().optional(),
        numOfRows: z.union([z.string(), z.number()]).optional(),
        pageNo: z.union([z.string(), z.number()]).optional(),
        totalCount: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  }),
});

export interface ParsedTourResponse {
  items: TourItem[];
  numOfRows: number;
  pageNo: number;
  totalCount: number;
  resultCode: string;
}

export type TourItem = z.infer<typeof tourItemSchema>;
