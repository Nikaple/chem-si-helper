import '../styles/base.scss';

// mock data

import { mockH1Data, mockC13Data, mockMassData, mockRealData } from './utils/mock';
const $input = <HTMLInputElement>document.querySelector('#input');
// $input.innerHTML = mockH1Data + '\n' + mockC13Data;
$input.innerHTML = mockRealData;

import { AppComponent } from './appComponent';
AppComponent.getInstance;

