import { z } from "zod";

export const tourItemSchema = z
  .object({
    contentid: z.coerce.string(),
    contenttypeid: z.coerce.string().optional(),
    title: z.string().optional(),
    addr1: z.string().optional(),
    addr2: z.string().optional(),
    mapx: z.coerce.string().optional(),
    mapy: z.coerce.string().optional(),
    tel: z.string().optional(),
    firstimage: z.string().optional(),
    modifiedtime: z.coerce.string().optional(),
    cpyrhtDivCd: z.string().optional(),
    acmpyTypeCd: z.string().optional(),
    acmpyPsblCpam: z.string().optional(),
    acmpyNeedMtr: z.string().optional(),
    etcAcmpyInfo: z.string().optional(),
    relaAcdntRiskMtr: z.string().optional(),
    relaPosesFclty: z.string().optional(),
    relaFrnshPrdlst: z.string().optional(),
    relaPurcPrdlst: z.string().optional(),
    relaRntlPrdlst: z.string().optional(),
  })
  .passthrough();

const itemsSchema = z.union([
  z.object({ item: z.array(tourItemSchema) }),
  z.literal(""),
]);

export const tourResponseSchema = z.object({
  response: z.object({
    header: z.object({
      resultCode: z.coerce.string(),
      resultMsg: z.string(),
    }),
    body: z.object({
      items: itemsSchema,
      numOfRows: z.coerce.number(),
      pageNo: z.coerce.number(),
      totalCount: z.coerce.number(),
    }),
  }),
});

export type TourItem = z.infer<typeof tourItemSchema>;
export type TourResponse = z.infer<typeof tourResponseSchema>;
