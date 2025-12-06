import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { GraphEditorComponent } from './graph-editor/graph-editor.component';
import { RightPanelComponent } from './right-panel/right-panel.component';
import { MetadataPanelComponent } from './metadata-panel/metadata-panel.component';
import { HamburgerMenuComponent } from './hamburger-menu/hamburger-menu.component';

@NgModule({
  declarations: [AppComponent, GraphEditorComponent, RightPanelComponent, MetadataPanelComponent, HamburgerMenuComponent],
  imports: [BrowserModule, FormsModule],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
