import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { GraphEditorComponent } from './graph-editor/graph-editor.component';
import { RightPanelComponent } from './graph-editor/right-panel/right-panel.component';

@NgModule({
  declarations: [AppComponent, GraphEditorComponent, RightPanelComponent],
  imports: [BrowserModule, FormsModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
