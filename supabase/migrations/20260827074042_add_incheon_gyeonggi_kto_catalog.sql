-- Add the two KTO-only regional catalogs to the existing shared ingestion and
-- snapshot architecture. Kakao collection remains disabled for both regions.

insert into public.regions (
  region_id,
  display_name,
  legal_dong_code,
  kakao_collection_enabled,
  kto_catalog_enabled,
  kto_collection_enabled,
  kto_registry_version,
  kto_collection_west,
  kto_collection_south,
  kto_collection_east,
  kto_collection_north,
  kto_catalog_datasets,
  kto_list_only_content_type_ids
) values
  ('incheon', '인천', '28', false, true, true,
    'tour-incheon-service2-v1', 124.4, 36.9, 126.9, 38.0,
    array['core', 'shopping']::text[], array[38]::integer[]),
  ('gyeonggi', '경기', '41', false, true, true,
    'tour-gyeonggi-service2-v1', 126.45, 36.8, 127.9, 38.35,
    array['core', 'shopping']::text[], array[38]::integer[]);

insert into public.region_districts (
  region_id,
  district_code,
  district_name
) values
  ('incheon', '125', '제물포구'),
  ('incheon', '155', '영종구'),
  ('incheon', '177', '미추홀구'),
  ('incheon', '185', '연수구'),
  ('incheon', '200', '남동구'),
  ('incheon', '237', '부평구'),
  ('incheon', '245', '계양구'),
  ('incheon', '275', '서해구'),
  ('incheon', '290', '검단구'),
  ('incheon', '710', '강화군'),
  ('incheon', '720', '옹진군'),
  ('gyeonggi', '110', '수원시'),
  ('gyeonggi', '130', '성남시'),
  ('gyeonggi', '150', '의정부시'),
  ('gyeonggi', '170', '안양시'),
  ('gyeonggi', '190', '부천시'),
  ('gyeonggi', '210', '광명시'),
  ('gyeonggi', '220', '평택시'),
  ('gyeonggi', '250', '동두천시'),
  ('gyeonggi', '270', '안산시'),
  ('gyeonggi', '280', '고양시'),
  ('gyeonggi', '290', '과천시'),
  ('gyeonggi', '310', '구리시'),
  ('gyeonggi', '360', '남양주시'),
  ('gyeonggi', '370', '오산시'),
  ('gyeonggi', '390', '시흥시'),
  ('gyeonggi', '410', '군포시'),
  ('gyeonggi', '430', '의왕시'),
  ('gyeonggi', '450', '하남시'),
  ('gyeonggi', '460', '용인시'),
  ('gyeonggi', '480', '파주시'),
  ('gyeonggi', '500', '이천시'),
  ('gyeonggi', '550', '안성시'),
  ('gyeonggi', '570', '김포시'),
  ('gyeonggi', '590', '화성시'),
  ('gyeonggi', '610', '광주시'),
  ('gyeonggi', '630', '양주시'),
  ('gyeonggi', '650', '포천시'),
  ('gyeonggi', '670', '여주시'),
  ('gyeonggi', '800', '연천군'),
  ('gyeonggi', '820', '가평군'),
  ('gyeonggi', '830', '양평군');

-- Keep the public snapshot page ordered and region/dataset isolated even when
-- list-only Shopping catalogs contain thousands of rows.
create index map_places_region_dataset_provider_active_id_idx
  on public.map_places (region_id, catalog_dataset, provider, is_active, id);

create index map_place_query_hits_region_candidate_query_idx
  on public.map_place_query_hits (region_id, candidate_id, query_key);
