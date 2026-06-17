import { items } from './catalog';

export const currentRuleSelectableItemIds = items.filter((item) => item.legalInCurrentRule).map((item) => item.id);

export const currentRuleNatureOptions = [
  { id: '大胆', enName: 'bold', up: ['防御'], down: ['攻击'], neutral: false },
  { id: '胆小', enName: 'timid', up: ['速度'], down: ['攻击'], neutral: false },
  { id: '固执', enName: 'adamant', up: ['攻击'], down: ['特攻'], neutral: false },
  { id: '急躁', enName: 'hasty', up: ['速度'], down: ['防御'], neutral: false },
  { id: '乐天', enName: 'lax', up: ['防御'], down: ['特防'], neutral: false },
  { id: '冷静', enName: 'quiet', up: ['特攻'], down: ['速度'], neutral: false },
  { id: '马虎', enName: 'rash', up: ['特攻'], down: ['特防'], neutral: false },
  { id: '慢吞吞', enName: 'mild', up: ['特攻'], down: ['防御'], neutral: false },
  { id: '内敛', enName: 'modest', up: ['特攻'], down: ['攻击'], neutral: false },
  { id: '怕寂寞', enName: 'lonely', up: ['攻击'], down: ['防御'], neutral: false },
  { id: '慎重', enName: 'careful', up: ['特防'], down: ['特攻'], neutral: false },
  { id: '爽朗', enName: 'jolly', up: ['速度'], down: ['特攻'], neutral: false },
  { id: '淘气', enName: 'impish', up: ['防御'], down: ['特攻'], neutral: false },
  { id: '天真', enName: 'naive', up: ['速度'], down: ['特防'], neutral: false },
  { id: '顽皮', enName: 'naughty', up: ['攻击'], down: ['特防'], neutral: false },
  { id: '温和', enName: 'calm', up: ['特防'], down: ['攻击'], neutral: false },
  { id: '温顺', enName: 'gentle', up: ['特防'], down: ['防御'], neutral: false },
  { id: '勇敢', enName: 'brave', up: ['攻击'], down: ['速度'], neutral: false },
  { id: '悠闲', enName: 'relaxed', up: ['防御'], down: ['速度'], neutral: false },
  { id: '自大', enName: 'sassy', up: ['特防'], down: ['速度'], neutral: false },
  { id: '浮躁', enName: 'quirky', up: [], down: [], neutral: true },
  { id: '害羞', enName: 'bashful', up: [], down: [], neutral: true },
  { id: '勤奋', enName: 'hardy', up: [], down: [], neutral: true },
  { id: '认真', enName: 'serious', up: [], down: [], neutral: true },
  { id: '坦率', enName: 'docile', up: [], down: [], neutral: true },
] as const;

export const currentRuleCatalogNotes = {
  items: 'Selectable item pool is generated from the joined Reg M-B item catalog. Rows remain manual-review until cross-checked against a primary source.',
  moves: 'Move choices are generated from PokéBase Champions current-rule Available Moves pages, with PokeAPI used only for Chinese move names and descriptions.',
  natures: 'Full 25 main-series natures ingested from PokeAPI. Champions nature compatibility remains manual-review pending official confirmation.',
} as const;
