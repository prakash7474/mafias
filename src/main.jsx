import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={failed:false};}
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(error){console.info('MAFIAS recovered from a rendering error:',error?.message);}
  render(){
    if(this.state.failed)return <main className="crash">
      <p className="eyebrow"><span/> THE GRAVEYARD IS SLEEPING <span/></p>
      <h1>THE SHADOWS<br/><em>RESIST.</em></h1>
      <p className="copy">Something went wrong while rendering the experience.</p>
      <button className="enter" onClick={()=>window.location.reload()}>RELOAD EXPERIENCE <b>↺</b></button>
    </main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<React.StrictMode><ErrorBoundary><App/></ErrorBoundary></React.StrictMode>);
