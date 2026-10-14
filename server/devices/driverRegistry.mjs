/**
 * Driver registry — maps protocol / fetchApi keys to implementations.
 */
import zk from './drivers/zk.mjs';
import isapi from './drivers/isapi.mjs';
import dws from './drivers/dws.mjs';
import fpvtech from './drivers/fpvtech.mjs';
import controlianz from './drivers/controlianz.mjs';
import biostar2 from './drivers/biostar2.mjs';
import kteConnect from './drivers/kteConnect.mjs';
import genericTcp from './drivers/genericTcp.mjs';
import virdi from './drivers/virdi.mjs';
import trustone from './drivers/trustone.mjs';
import tosan from './drivers/tosan.mjs';
import cmitech from './drivers/cmitech.mjs';

const drivers = {
  zk: zk,
  'zk-pull': zk,
  isapi: isapi,
  websockets: isapi,      // push variant handled by webhook; pull uses ISAPI
  dws: dws,
  fpvtech: fpvtech,
  controlianz: controlianz,
  telnet: controlianz,
  suprema: biostar2,
  biostar2: biostar2,
  'kte-connect': kteConnect,
  realtime: genericTcp,
  smartplus: genericTcp,
  apex: genericTcp,
  crosschex: zk,
  'essl-pull': zk,
  pullsdk: genericTcp,
  'wiegand-gateway': genericTcp,
  sdk600: genericTcp,
  tcp: genericTcp,
  custom: genericTcp,
  virdi: virdi,
  'virdicore': virdi,
  trustone: trustone,
  tosan: tosan,
  cmitech: cmitech,
};

export function getDriver(protocol) {
  return drivers[String(protocol || '').toLowerCase()] || null;
}

export function supportedProtocols() {
  return Object.keys(drivers);
}
