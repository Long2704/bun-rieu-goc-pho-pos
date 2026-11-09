export type MenuGroup={id:string;name:string;category:string;sort:number};
export type GroupCatalog={groups:MenuGroup[];assignments:Record<string,string>};
export const defaultGroups:MenuGroup[]=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}];
export function isGroupCatalog(value:unknown):value is GroupCatalog{
 if(!value||typeof value!=='object')return false;
 const c=value as GroupCatalog;
 return Array.isArray(c.groups)&&c.groups.length>=3&&c.groups.every(g=>typeof g.id==='string'&&typeof g.name==='string'&&defaultGroups.some(d=>d.category===g.category)&&Number.isInteger(g.sort))&&!!c.assignments&&typeof c.assignments==='object'&&!Array.isArray(c.assignments)&&Object.values(c.assignments).every(id=>typeof id==='string'&&c.groups.some(g=>g.id===id));
}
