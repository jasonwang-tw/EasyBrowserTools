const checked='2026-11-18';
const template=(id,platform,label,width,height)=>({id,platform,label,width,height,kind:'PageKit 常用範本',checked,source:null});
const official=(id,platform,label,width,height,source,extra={})=>({...template(id,platform,label,width,height),kind:'官方規格／建議',source,...extra});
const x='https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo';
const youtube='https://support.google.com/youtube/answer/10456525';
const linkedin='https://www.linkedin.com/help/linkedin/answer/a563309';
export const CROP_PRESETS=[
 template('fb-avatar','Facebook','大頭貼',400,400),template('fb-square','Facebook','正方形貼文',1080,1080),template('fb-portrait','Facebook','直式貼文',1080,1350),template('fb-cover','Facebook','封面',851,315),template('fb-story','Facebook','限時動態',1080,1920),
 template('ig-avatar','Instagram','大頭貼',400,400),template('ig-square','Instagram','正方形貼文',1080,1080),template('ig-portrait','Instagram','直式貼文 4:5',1080,1350),template('ig-tall','Instagram','直式貼文 3:4',1080,1440),template('ig-story','Instagram','限時動態／Reels 封面',1080,1920),
 template('threads-avatar','Threads','大頭貼',400,400),template('threads-square','Threads','正方形貼文',1080,1080),template('threads-portrait','Threads','直式貼文',1080,1350),template('threads-landscape','Threads','橫式貼文',1600,900),
 template('yt-avatar','YouTube','大頭貼',800,800),template('yt-thumbnail','YouTube','影片縮圖',1280,720),official('yt-banner','YouTube','頻道橫幅',2560,1440,youtube,{safe:{width:1235/2048,height:338/1152}}),
 official('x-avatar','X','大頭貼',400,400,x),official('x-banner','X','封面',1500,500,x),template('x-post','X','橫式貼文',1600,900),
 official('li-avatar','LinkedIn','公司頁標誌',400,400,linkedin),official('li-personal','LinkedIn','個人封面',1584,396,'https://www.linkedin.com/help/recruiter/answer/a549049'),official('li-company','LinkedIn','公司頁封面',1512,256,linkedin),template('li-post','LinkedIn','橫式貼文',1200,627),
 template('line-avatar','LINE','大頭貼',640,640),template('line-post','LINE','正方形圖片',1080,1080),template('line-background','LINE','直式背景',1080,1920),official('line-rich-large','LINE','官方帳號圖文選單（大）',2500,1686,'https://developers.line.biz/en/docs/messaging-api/using-rich-menus/'),template('line-rich-small','LINE','官方帳號圖文選單（小）',2500,843)
];
export const CROP_RATIOS=[['free','自由比例'],['original','原比例'],['1:1','1:1 正方形'],['4:3','4:3 橫式'],['3:4','3:4 直式'],['16:9','16:9 橫式'],['9:16','9:16 直式'],['3:2','3:2 橫式'],['2:3','2:3 直式'],['4:5','4:5 直式'],['5:4','5:4 橫式']];
