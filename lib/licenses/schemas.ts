import { z } from "zod";

const providerScalarSchema = z
  .union([z.string(), z.number(), z.boolean(), z.null()])
  .optional();

export const localDataItemSchema = z
  .object({
    MNG_NO: providerScalarSchema,
    BPLC_NM: providerScalarSchema,
    ROAD_NM_ADDR: providerScalarSchema,
    LOTNO_ADDR: providerScalarSchema,
    ROAD_NM_ZIP: providerScalarSchema,
    LCTN_ZIP: providerScalarSchema,
    LCPMT_YMD: providerScalarSchema,
    SALS_STTS_CD: providerScalarSchema,
    SALS_STTS_NM: providerScalarSchema,
    DTL_SALS_STTS_CD: providerScalarSchema,
    DTL_SALS_STTS_NM: providerScalarSchema,
    CLSBIZ_YMD: providerScalarSchema,
    SUSPN_BGNG_YMD: providerScalarSchema,
    SUSPN_END_YMD: providerScalarSchema,
    RSMPTN_YMD: providerScalarSchema,
    TELNO: providerScalarSchema,
    OPN_ATMY_GRP_CD: providerScalarSchema,
    SNTTN_BZSTAT_NM: providerScalarSchema,
    BZSTAT_SE_NM: providerScalarSchema,
    TOUR_LDGBIZ_DTL_NM: providerScalarSchema,
    CULTR_SPTS_TPBIZ_NM: providerScalarSchema,
    KSRM_CNT: providerScalarSchema,
    GSRM_CNT: providerScalarSchema,
    LCTN_AREA: providerScalarSchema,
    ARCH_TFA: providerScalarSchema,
    DAT_UPDT_PNT: providerScalarSchema,
    LAST_MDFCN_PNT: providerScalarSchema,
    bplcNm: providerScalarSchema,
    roadNmAddr: providerScalarSchema,
    lotnoAddr: providerScalarSchema,
  })
  .catchall(providerScalarSchema);

export const localDataEnvelopeSchema = z.object({
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

export interface ParsedLocalDataResponse {
  items: LocalDataItem[];
  numOfRows: number;
  pageNo: number;
  totalCount: number;
  resultCode: string;
}

export type LocalDataItem = z.infer<typeof localDataItemSchema>;
