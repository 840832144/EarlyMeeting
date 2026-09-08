'use strict';

const hasEstimatedToday=text=>/(?:预计|预期|计划|争取|力争|可能|大概|有望)\s*(?:可|能|会|将|能够|可以)?\s*(?:在|于)?\s*(?:今日|今天)|(?:今日|今天)\s*(?:预计|预期|计划|争取|力争|可能|大概|有望)/u.test(text);
const hasTodaySignal=text=>/(?:今日|今天)交付/u.test(text)||hasEstimatedToday(text);

const clean=value=>value.trim().replace(/^(?:[-*•]\s+|\d+\s*[.、)）]\s*)/u,'')
  .replace(/^[\s:：,，。]+|[\s,，。]+$/gu,'').trim();

// Explicit markers only. Newlines/semicolons delimit separate work items;
// an isolated heading applies to the next item, never the entire report.
function extractDelivery(content) {
  const result=[];let nextIsDelivery=false;
  for(const raw of content.split(/[\r\n;；]+/u)) {
    const item=clean(raw);if(!item)continue;
    if(/^(?:今日交付)\s*[:：]?$/u.test(item)){nextIsDelivery=true;continue;}
    let task='';
    const prefix=item.match(/(?:^|[，,。])\s*今日交付\s*[:：]\s*(.+)$/u);
    const suffix=item.match(/^(.*?)\s*今日交付\s*[。.!！,，]*$/u);
    if(prefix)task=prefix[1].replace(/[，,。\s]*今日交付\s*$/u,'');
    else if(suffix&&!/(?:不|非|无|未|无需)\s*$/u.test(suffix[1])) {
      // A trailing marker belongs to the nearest clause, not earlier work.
      task=clean(suffix[1]).split(/[，,。！？]/u).filter(part=>part.trim()).at(-1)||'';
    }else if(nextIsDelivery&&!/^[^:：]{1,16}[:：]/u.test(item)&&!item.includes('今日交付'))task=item;
    nextIsDelivery=false;
    task=clean(task);
    if(task&&!result.includes(task))result.push(task);
  }
  return result;
}

function deliveryEntries(rows) {
  // content is the last successful submission even while its input is open.
  return ['planning','engineering'].flatMap(section=>rows.filter(row=>row.section===section))
    .map(row=>({owner:row.owner,tasks:row.deliveryResult?.tasks||extractDelivery(row.content),
      pending:row.deliveryResult&&row.deliveryResult.status!=='ready'})).filter(entry=>entry.tasks.length||entry.pending);
}

// Only the trusted row owner becomes an @ tag. Work text stays literal.
function escapeMarkdown(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/([\\`*_{}\[\]()#!|~])/g,'\\$1');
}

function deliverySummary(rows) {
  const entries=deliveryEntries(rows);
  return entries.length?entries.map(entry=>`<at id=${entry.owner}></at> ${entry.tasks.map(escapeMarkdown).join('；')}${entry.pending?'（今日交付待更新）':''}`).join('\n\n')
    :'暂无已标记的今日交付。';
}

module.exports={extractDelivery,deliveryEntries,deliverySummary,hasEstimatedToday,hasTodaySignal};
