import { pullAll, forEach, compact, replace, chain,
  includes, round, escapeRegExp, escape } from 'lodash';
import { ComponentData, descriptions } from './utils/constants';
import { Tooltip } from './utils/tooltip';
import { H1Component } from './h1Component';
import { C13Component } from './c13Component';
import { HrmsComponent } from './hrmsComponent';
import { highlightData, clearDOMElement, copyFormattedStrToClipboard } from './utils/utils';
import { HighlightType } from './utils/nmr';
import { LanguageService, Languages } from './utils/language';


export class AppComponent {
  // data from input
  private inputText: string;
  // output plain text
  private outputPlainText: string;
  // output text with highlight
  private outputRichText: string;
  // input element
  private $input: HTMLTextAreaElement;
  // output element
  private $output: HTMLDivElement;
  // autoCopy node
  private $autoCopy: HTMLInputElement;
  // data collected from other components
  private acquiredData: ComponentData[];
  // instance for singleton
  private static instance: AppComponent;
  
  /**
   * Creates an instance of AppComponent.
   * 
   * @memberof AppComponent
   */
  constructor() {
    this.$input = document.querySelector('#input') as HTMLTextAreaElement;
    this.$output = document.querySelector('#output') as HTMLDivElement;
    this.$autoCopy = document.querySelector('#autoCopy') as HTMLInputElement;
    this.acquiredData = [];
    this.init();
  }

  private init() {
    // create tools
    LanguageService.getInstance;
    Tooltip.getInstance;
    this.attachEvents();

    // create components
    H1Component.getInstance;
    C13Component.getInstance;
    HrmsComponent.getInstance;
    
    // handle changes
    this.handle();


  }

  
  /**
   * Handles data from other components
   * 
   * @private
   * 
   * @memberof AppComponent
   */
  private handle() {
    this.reset();
    const c13Data = C13Component.getInstance.handle();
    const hrmsData = HrmsComponent.getInstance.handle();
    const h1Data = H1Component.getInstance.handle();
    const componentsData = compact([h1Data, c13Data, hrmsData]);
    if (componentsData.length === 0) {
      return;
    }
    this.render(<ComponentData[]>componentsData);
  }

  /**
   * reset output and error strings
   * 
   * @private
   * 
   * @memberof AppComponent
   */
  private reset() {
    // remove tooltip
    Tooltip.getInstance.destroy();
    // clear dom
    if (this.$input.value === '') {
      clearDOMElement('#error');
      clearDOMElement('#output');
    }
  }
  /**
   * render received data to screen
   * 
   * @param {ComponentData[]} componentsData 
   * 
   * @memberof AppComponent
   */
  public render(componentsData: ComponentData[]) {
    // clear error div
    clearDOMElement('#error');
    let plainText = this.$input.value;
    if (this.$autoCopy.checked) {
      // get plainText by replacing input string with componentData[index].outputPlain[index]
      forEach(componentsData, (componentData) => {
        forEach(componentData.input, (input, index) => {
          plainText = chain(plainText)
            .replace(input, componentData.outputPlain[index])
            .replace(/\n/g, '<br>')
            .value();
        });
      });
      copyFormattedStrToClipboard(plainText);
    }
    let richText = this.$input.value;
    // get plainText by replacing input string with componentData[index].outputPlain[index]
    forEach(componentsData, (componentData) => {
      forEach(componentData.input, (input, index) => {
        const replacement = includes(componentData.outputRich[index], 'data-tooltip')
          ? componentData.outputRich[index]
          : highlightData(componentData.outputRich[index], HighlightType.Success);
        richText = chain(richText)
          .replace(new RegExp(escapeRegExp(input), 'g'), replacement)
          .replace(/\n/g, '<br>')
          .value();
      });
    });
    this.$output.innerHTML = richText;
  }

  /**
   * attach all events
   * 
   * @private
   * 
   * @memberof AppComponent
   */
  private attachEvents() {
    this.onTextChange();
    this.onScrollSync();
    this.onLanguageChange();
  }

  /**
   * listen on input of textarea
   * 
   * @private
   * 
   * @memberof AppComponent
   */
  private onTextChange() {
    // bind event listeners
    const $languageTrigger = document.querySelector('.language') as HTMLDivElement;
    const $checkboxes = Array.from(document.querySelectorAll('div.checkbox-wrapper input'));
    const $peaks = document.querySelector('#input') as HTMLTextAreaElement;
    forEach([$peaks, ...$checkboxes], (el) => {
      el.addEventListener('input', this.handle.bind(this));
      el.addEventListener('change', this.handle.bind(this));
    });
  }

  /**
   * synchronize input and output by percentage
   * 
   * @private
   * 
   * @memberof AppComponent
   */
  private onScrollSync() {
    const $outputScrollbarHolder = <HTMLDivElement>document.querySelector('.output-container');
    const $inputScrollbarHolder = this.$input;

    let leftScrollFlag = false;
    let rightScrollFlag = false;

    const outputScroll = function () {
      const scrollPercent = $outputScrollbarHolder.scrollTop / $outputScrollbarHolder.scrollHeight;
      if (!leftScrollFlag) {
        $inputScrollbarHolder.scrollTop = 
        round(scrollPercent * $inputScrollbarHolder.scrollHeight);
        rightScrollFlag = true;
      }
      leftScrollFlag = false;
    };
    const inputScroll = function () {
      const scrollPercent = $inputScrollbarHolder.scrollTop / $inputScrollbarHolder.scrollHeight;
      if (!rightScrollFlag) {
        $outputScrollbarHolder.scrollTop = 
        round(scrollPercent * $outputScrollbarHolder.scrollHeight);
        leftScrollFlag = true;
      }
      rightScrollFlag = false;
    };

    $inputScrollbarHolder.addEventListener('scroll', inputScroll);
    $outputScrollbarHolder.addEventListener('scroll', outputScroll);
  }

  /**
   * event fired when language changes
   * 
   * @private
   * @memberof AppComponent
   */
  private onLanguageChange() {
    const $help = document.querySelector('.fork-me') as HTMLAnchorElement;
    const $languageTrigger = document.querySelector('.language') as HTMLDivElement;
    const $labels = Array.from(document.querySelectorAll('.radio-text'));
    const changeLanguage = function (e: Event) {
      e.preventDefault();
      LanguageService.getInstance.switchLanguage();
      const currentLanguage = LanguageService.getInstance.getLanguage();
      $help.title = descriptions.ribbons[0][currentLanguage];
      $languageTrigger.title = descriptions.ribbons[1][currentLanguage];
      forEach($labels, ($label, index) => {
        $label.innerHTML = descriptions.configs[index][currentLanguage];
      });
    };
    let $clicked: EventTarget;
    document.body.addEventListener('mousedown', (e) => {
      $clicked = e.target;
    });
    $languageTrigger.addEventListener('mouseup', (e) => {
      if (e.target !== $clicked) {
        return;
      }
      changeLanguage(e);
      this.handle();
    });
  }
  
  /**
   * Creates an unique instance of AppComponent
   * 
   * @readonly
   * @static
   * @type {AppComponent}
   * @memberof AppComponent
   */
  public static get getInstance(): AppComponent {
    if (!AppComponent.instance) {
      AppComponent.instance = new AppComponent;
    }
    return AppComponent.instance;
  }
}
