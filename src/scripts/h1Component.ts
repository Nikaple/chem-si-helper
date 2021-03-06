import { ComponentData, solventsInfo } from './utils/constants';
import { handleNMRData, Metadata, H1Data, H1RenderObj,
  HighlightType, Multiplet, isSinglePeak, isMultiplePeak,
  isPeak, isMultiplePeakWithJ, JCount,
} from './utils/nmr';
import { highlightData, escapeSpace, clearDOMElement } from './utils/utils';
import { nmrRegex } from './utils/regex';
import { some, split, map, forEach, clone, every, replace, slice, join, chain,
  endsWith, compact, includes } from 'lodash';
import { LanguageService, Languages } from './utils/language';

const peakRangePlaceholder = 'PEAKRANGE';

export class H1Component {
  // data from input
  private inputtedData: string;
  // data that match '1H NMR: ....'
  private matchedData: string[]|null;
  // highlight data or not
  private willHighlightData: boolean;
  // error message
  private errMsg: {
    dataErr: string[];
    infoErr: string[];
    peakErr: string[];
  };
  // tooltip error messages
  private tooltipErrors: (string[]|string[][])[];
  private domElements: {
    $general: HTMLInputElement;
    $autoFixJ: HTMLInputElement;
    $strict: HTMLInputElement;
    $error: HTMLDivElement;
  };
  private isStrict: boolean;
  // instance for singleton
  private static instance: H1Component;

  /**
   * Creates an instance of H1Component.
   * 
   * @memberof H1Component
   */
  private constructor() {
    this.inputtedData = '';
    this.willHighlightData = false;
    this.errMsg = {
      dataErr: ['Data not valid! Please copy data straightly from peak analysis programs.',
        '谱图数据格式不正确！请直接从MestReNova中粘贴'],
      infoErr: ['Frequency/solvent not valid! Please copy data straightly \
      from peak analysis programs.',
        '频率或溶剂信息有误！请直接从MestReNova中粘贴'],
      peakErr: ['Peak data not valid! Please copy data straightly from peak analysis programs.',
        '谱峰数据不正确！请直接从MestReNova中粘贴！错误的内容已用红色标出: <br>'],
    };
    this.tooltipErrors = [
      [[' only', '只'], [' peak should', '峰应'], [' have ', '有'], [' coupling constant', '个耦合常数']],
      ['Invalid format.', '格式有误'],
      ['Chemical shift of multiplet should be written from low field to high field.',
        '多重峰化学位移区间应由低场向高场书写'],
      [' peak type does not exists.', '峰类型不存在'],
      ['Multiplet peaks should be reported in interval', '多重峰化学位移应为区间形式'],
      ['Do not report coupling constants in multiplet peaks', '多重峰不存在耦合常数'],
      [' peak should have only one chemical shift', '峰化学位移应为单值'],
      [' peak do not have coupling constants', '峰不存在耦合常数'],
      [' peak should have coupling constants', '峰应有耦合常数'],
      ['Original data: ', '原始数据：'],
      [' peak has been marked as multiplets, please report the spectrum data manually', 
        '峰已被标注为多重峰，请从MestReNova中手动输入化学位移数据'],
    ];
    this.domElements = {
      $general: document.querySelector('#generalMultiplet') as HTMLInputElement,
      $autoFixJ: document.querySelector('#autoFixJ') as HTMLInputElement,
      $strict: document.querySelector('#strict') as HTMLInputElement,
      $error: document.querySelector('#error') as HTMLDivElement,
    };
  }

  /**
   * handle changes in H1Component
   * 
   * @private
   * @returns {void} 
   * 
   * @memberof H1Component
   */
  public handle(): ComponentData|null {
    this.reset();
    const parsedData = handleNMRData(this, 'H', this.isStrict);
    if (parsedData === null) {
      return null;
    }
    const { peakData, metadataArr, tailArr, errorArr } = parsedData;
    const peakDataObjs = map(peakData, peakDatum =>
      map(peakDatum, data => this.parsePeakData(data)),
    ) as H1Data[][];
    const isPeakDataObjContainNull = some(peakDataObjs, (peakDataObj) => {
      return some(peakDataObj, h1data => h1data === null);
    });
    if (isPeakDataObjContainNull) {
      return null;
    }
    const fixedPeakDataObj: H1Data[][] = map(peakDataObjs, (peakDatum, index) => {
      let freq = 1;
      const meta = metadataArr[index];
      if (meta !== null) {
        freq = meta.freq;
      }
      return map(peakDatum, peak => this.fixPeakData(peak, freq));
    });
    return this.render(metadataArr, fixedPeakDataObj, tailArr, errorArr);
  }
  
  /**
   * reset status
   * 
   * @private
   * 
   * @memberof H1Component
   */
  private reset() {
    this.inputtedData  = (<HTMLInputElement>document.querySelector('#input')).value;
    this.willHighlightData = false;
    this.isStrict = this.domElements.$strict.checked;
  } 

  
  /**
   * return h1Component data to render
   * 
   * @private
   * @param {Metadata[]} metadataArr 
   * @param {H1Data[][]} peakDataObjs 
   * @param {string[]} tailArr 
   * @returns {ComponentData} 
   * 
   * @memberof H1Component
   */
  private render(
    metadataArr: (Metadata|null)[],
    peakDataObjs: H1Data[][],
    tailArr: string[],
    errorArr: (string|null)[]): ComponentData {
    const h1RenderObjs:  H1RenderObj[] = [];
    forEach(metadataArr, (meta: Metadata, index) => {
      const obj = {} as H1RenderObj;
      obj.meta = metadataArr[index] as Metadata;
      obj.peak = peakDataObjs[index];
      obj.tail = tailArr[index];
      obj.metaErr = errorArr[index];
      h1RenderObjs.push(obj);
    });
    const input = this.matchedData as string[];
    const outputPlain = this.renderStrArrays(h1RenderObjs);
    this.willHighlightData = true;
    const outputRich = this.renderStrArrays(h1RenderObjs);
    return { input, outputPlain, outputRich };
  }

  /**
   * render data from individual H1 render objects
   * @example
   * // returns '<sup>1</sup>H NMR (400 MHz, CDCl<sub>3</sub>) δ 7.77 (s, 1H).'
   * renderStrArrays([{
   *    meta: {
   *      type: 'H',
   *      solvent: 'cdcl3',
   *      freq: 400,
   *    }
   *    peak: [
   *      {
   *        peak: 7.77,
   *        peakType: 's',
   *        Js: null,
   *        hydrogenCount: 1,
   *      }
   *    ],
   *    tail: '.'
   * }])
   * @private
   * @param {H1RenderObj[]} h1RenderObjs 
   * @returns 
   * 
   * @memberof H1Component
   */
  private renderStrArrays(h1RenderObjs: H1RenderObj[]): string[] {
    const output = map(h1RenderObjs, (obj: H1RenderObj) => {
      const headStr = obj.metaErr !== null
      ? obj.metaErr : 
      `<sup>1</sup>H NMR (${obj.meta.freq} MHz, \
      ${solventsInfo[obj.meta.solvent].formattedString}) δ `;
      const peakStr = chain(obj.peak)
        .map(this.stringifyPeakData.bind(this))
        .join(', ')
        .value();
      const tailStr = obj.tail;
      return this.willHighlightData
        ? `<strong>${headStr + peakStr + tailStr}</strong>`
        : headStr + peakStr + tailStr;
    });
    return output;
  }

  /**
   * render metadata to string
   * @example
   * // returns `<sup>1</sup>H NMR (500 MHz, DMSO-<em>d</em><sub>6</sub>) δ `
   * stringifyMetadata({
   *   type: 'H',
   *   freq: 500,
   *   solvent: dmso,
   * });
   * @private
   * @param {Metadata} metadata 
   * @returns {string}
   * 
   * @memberof H1Component
   */
  private stringifyMetadata(metadata: Metadata) {
    return `<sup>1</sup>H NMR (${metadata.freq} MHz, \
      ${solventsInfo[metadata.solvent].formattedString}) δ `;
  }

  /**
   * render individual peak data to string
   * @example
   * // returns '7.10 - 6.68 (m, 1H)'
   * this.stringifyPeakData({
   *  peak: [7.10, 6.68],
   *  peakType: 'm',
   *  Js: null,
   *  hydrogenCount: 1
   * });
   * @private
   * @param {H1Data} peakObj 
   * @returns {string} 
   * 
   * @memberof H1Component
   */
  private stringifyPeakData(peakObj: H1Data|string): string {
    if (!peakObj) {
      return '';
    }
    // if peakObj is errMsg bubbled up
    if (typeof peakObj === 'string') {
      return peakObj;
    }
    let formattedPeak = '';
    // if the peak is not PEAKRANGE, and do not contain danger/warning
    if (peakObj.peak !== peakRangePlaceholder && peakObj.peak[0] !== '<') {
      formattedPeak = (typeof peakObj.peak === 'string')
      ? Number(peakObj.peak).toFixed(2)
      : `${Number(peakObj.peak[0]).toFixed(2)}–${Number(peakObj.peak[1]).toFixed(2)}`;
    } else {
      formattedPeak = peakObj.peak as string;
    }
    const rendeDangerPeak = this.renderOnCondition(
      peakObj.danger,
      formattedPeak,
      HighlightType.Danger,
      peakObj.errMsg,
    );
    const rendeDangerPeakType = this.renderOnCondition(
      peakObj.peakTypeError,
      peakObj.peakType,
      HighlightType.Danger,
      peakObj.errMsg,
    );
    if (peakObj.Js === null) {
      // for peak object without J
      return `${rendeDangerPeak} \
      (${rendeDangerPeakType}, ${peakObj.hydrogenCount}H)`;
    } else {
      // for peak object with J
      const formattedJ = chain(peakObj.Js)
        .map(J => J.toFixed(1))
        .join(', ')
        .value();
      const renderDangerJ = this.renderOnCondition(
        this.willHighlightData && peakObj.warning,
        formattedJ,
        HighlightType.Warning,
        <string>peakObj.errMsg,
      );
      return `${rendeDangerPeak} (${rendeDangerPeakType}, <em>J</em> = \
      ${renderDangerJ} Hz, ${peakObj.hydrogenCount}H)`;
    }
  }

  private renderOnCondition(
    cond: boolean|undefined,
    strToRender: string,
    type: HighlightType,
    errMsg: string|undefined,
  ) : string {
    if (cond) {
      return highlightData(strToRender, type, errMsg);
    }
    return strToRender;
  }
  
  /**
   * returns object form of peak data
   * @example 
   * [[
   *   {"peak":"7.15","peakType":"t","Js":11.2,"hydrogenCount":1},
   *   {"peak":["7.10","6.68"],"peakType":"m","Js":null,"hydrogenCount":1},
   *   {"peak":"4.46","peakType":"s","Js":null,"hydrogenCount":3},
   * ]]
   * @private
   * @param {string} data 
   * @returns {(H1Data|void)} 
   * 
   * @memberof H1Component
   */
  private parsePeakData(data: string): H1Data|string {
    const regexWithCoupling = nmrRegex.h1PeakWithJs[Number(this.isStrict)];
    const regexWithoutCoupling = nmrRegex.h1PeakWithoutJs[Number(this.isStrict)];
    const couplingMatch = data.match(regexWithCoupling);
    const nonCouplingMatch = data.match(regexWithoutCoupling);
    const currentLanguage = LanguageService.getInstance.getLanguage();
    if (couplingMatch) {
      // tslint:disable-next-line:variable-name
      const Js = chain(couplingMatch)
        .slice(3, 6)
        .map(Number)
        .compact()
        .value();
      const peakType = couplingMatch[2];
      let errMsg = '';
      let peakTypeError = false;
      // tslint:disable-next-line:variable-name
      const JNumber = JCount[peakType];
      if (Js.length !== JNumber) {
        // [['only', '只'], ['peak should'], ['have', '有'], ['coupling constant', '个耦合常数']],
        const zhi = JNumber === 1 ? this.tooltipErrors[0][0][currentLanguage] : '';
        const end = (currentLanguage === Languages.Chinese && JNumber > 1) ? 's' : '';
        // tslint:disable-next-line:max-line-length
        errMsg = `${peakType}${this.tooltipErrors[0][1][currentLanguage]}${zhi}${this.tooltipErrors[0][2][currentLanguage]}${JCount[peakType]}${this.tooltipErrors[0][3][currentLanguage]}${end}`;
        peakTypeError = true;
      }
      return {
        Js,
        peakTypeError,
        errMsg,
        peak: couplingMatch[1],
        peakType: peakType as Multiplet,
        hydrogenCount: +couplingMatch[6],
      };
    } else if (nonCouplingMatch) {
      const splitReg = / *[–−-] */;
      const hyphen = (<RegExpMatchArray>nonCouplingMatch[1].match(splitReg)) || [''];
      const peakArr = nonCouplingMatch[1].split(splitReg);
      const validHyphen = ['–', ' – ', '−', ' − ', ' - ', '-'];
      const validEnding = ['H', '.', ';'];
      let peak;
      if (!includes(validEnding, nonCouplingMatch[0].substr(-1))) {
        data = includes(data, ')') ? data : data + ')';
        return highlightData(
          `${escapeSpace(data)}`, 
          HighlightType.Danger, 
          this.tooltipErrors[1][currentLanguage] as string,
        );
      }
      if (this.isStrict && !includes(validHyphen, hyphen[0]) && hyphen[0] !== '') {
        peak = highlightData(
          nonCouplingMatch[1], 
          HighlightType.Danger, 
          this.tooltipErrors[1][currentLanguage] as string,
        ); 
        return {
          peak,
          peakType: nonCouplingMatch[3] as Multiplet,
          Js: null,
          hydrogenCount: +nonCouplingMatch[4],
        };
      } else {
        peak = peakArr.length === 1 ? peakArr[0] : peakArr;
        const danger = Number(peakArr[0]) < Number(peakArr[1]) ? true : false;
        const errMsg = danger ? this.tooltipErrors[2][currentLanguage] as string : '';
        return {
          peak,
          danger,
          errMsg,
          peakType: nonCouplingMatch[3] as Multiplet,
          Js: null,
          hydrogenCount: +nonCouplingMatch[4],
        };
      }
    } else {
      data = includes(data, ')') ? data : data + ')';
      // escape space here.
      return highlightData(
        `${escapeSpace(data)}`, 
        HighlightType.Danger, 
        this.tooltipErrors[1][currentLanguage] as string,
      );
    }
  }

  /**
   * check for the validity of peak data, report errors on invalid.
   * 
   * @private
   * @param {H1Data} peakDatum 
   * @param {number} freq 
   * @returns {H1Data} 
   * 
   * @memberof H1Component
   */
  private fixPeakData(peakDatum: H1Data, freq: number): H1Data {
    if (!peakDatum || typeof peakDatum === 'string') {
      return peakDatum;
    }
    const isGeneral = !this.domElements.$general.checked;
    const willFixJ = this.domElements.$autoFixJ.checked;
    const currentLanguage = LanguageService.getInstance.getLanguage();
    const peakDatumCopy = clone(peakDatum);
    if (!isPeak(peakDatumCopy.peakType)) {
      peakDatumCopy.peakTypeError = true;
      peakDatumCopy.errMsg = `${peakDatumCopy.peakType}${this.tooltipErrors[3][currentLanguage]}`; 
    } else {
      if (isMultiplePeak(peakDatumCopy.peakType)) {
        // peak type 'm' should have an range of peak
        if (typeof peakDatumCopy.peak === 'string') {
          peakDatumCopy.danger = true;
          peakDatumCopy.errMsg = this.tooltipErrors[4][currentLanguage] as string;
        }
        if (peakDatumCopy.Js !== null) {
          // single peaks shouldn't have coupling constants
          peakDatumCopy.warning = true;
          peakDatumCopy.errMsg = this.tooltipErrors[5][currentLanguage] as string;
        }
      } else { // all peak types except 'm' should only have one peak value
        if (typeof peakDatumCopy.peak !== 'string') {
          peakDatumCopy.danger = true;
          peakDatumCopy.errMsg = 
          `${peakDatumCopy.peakType}${this.tooltipErrors[6][currentLanguage]}`;
        }
        if (isSinglePeak(peakDatumCopy.peakType)) {
          if (peakDatumCopy.Js !== null) {
            // single peaks shouldn't have coupling constants
            peakDatumCopy.peakTypeError = true;
            peakDatumCopy.errMsg = 
            `${peakDatumCopy.peakType}${this.tooltipErrors[7][currentLanguage]}`;
          }
        } else {
          if (isMultiplePeakWithJ(peakDatumCopy.peakType, isGeneral)) {
            // for all peaks with coupling constants
            if (willFixJ) {
              if (!peakDatumCopy.Js) {
                // multiple peaks should have coupling constants
                peakDatumCopy.peakTypeError = true;
                peakDatumCopy.errMsg = 
                `${peakDatumCopy.peakType}${this.tooltipErrors[8][currentLanguage]}`;
              } else {
                const isAllJValid = every(peakDatumCopy.Js, J => this.isJValid(J, freq));
                if (!isAllJValid && !peakDatumCopy.peakTypeError) {
                  peakDatumCopy.Js = map(peakDatumCopy.Js, J => this.roundJ(J, freq));
                  peakDatumCopy.warning = true;
                  const originalJsString = 
                    chain(<number[]>peakDatum.Js)
                  .map(data => data.toFixed(1))
                  .join(', ')
                  .value();
                  peakDatumCopy.errMsg = `${this.tooltipErrors[9][currentLanguage]}<em>J</em> = \
                    ${originalJsString} Hz`;
                }
              }
            }
          } else {
            // treat other types of multiplet as m peak
            peakDatumCopy.danger = true;
            peakDatumCopy.peakType = 'm';
            peakDatumCopy.peak = peakRangePlaceholder;
            peakDatumCopy.Js = null;
            // tslint:disable-next-line:max-line-length
            peakDatumCopy.errMsg = `${peakDatum.peakType}\
            ${this.tooltipErrors[10][currentLanguage]}`;
          }
        }
      }
    }
    return peakDatumCopy;
  }

  /**
   * round the coupling constants so that they are multiples of frequency / 1000
   * 
   * @private
   * @param {number} J 
   * @param {number} freq 
   * @returns {number} 
   * 
   * @memberof H1Component
   */
  private roundJ(J: number, freq: number): number {
    const MAGNIFICATION = 1000;
    return Math.round(MAGNIFICATION * J / freq) * freq / MAGNIFICATION;
  }

  /**
   * return if the coupling constant is valid, and need to be rounded
   * 
   * @private
   * @param {(number|null)} J 
   * @param {number} freq 
   * @returns {boolean} 
   * 
   * @memberof H1Component
   */
  private isJValid(J: number|null, freq: number): boolean {
    if (!J) {
      return false;
    }
    const MAGNIFICATION = 1000;
    return MAGNIFICATION * J % freq === 0;
  }

  /**
   * render error to screen
   * 
   * @private
   * @param {string} msg 
   * 
   * @memberof H1Component
   */
  private renderError(msg: string): void {
    clearDOMElement('#output');
    if (this.inputtedData !== '') {
      this.domElements.$error.innerHTML = msg;
    }
  }

  /**
   * get instance for singleton
   * 
   * @readonly
   * @static
   * @type {H1Component}
   * @memberof H1Component
   */
  public static get getInstance(): H1Component {
    if (!H1Component.instance) {
      H1Component.instance = new H1Component();
    }
    return H1Component.instance;
  }
}
